import { Construct } from "constructs";
import { join } from "path";
import {
  StackProps,
  Stack,
  RemovalPolicy,
  SecretValue,
  Duration,
} from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfront_origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import * as stepfunctions_tasks from "aws-cdk-lib/aws-stepfunctions-tasks";

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(
      this,
      "cloudfront-OAI"
    );

    const assetBucket = new s3.Bucket(this, "AssetBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    assetBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [assetBucket.arnForObjects("*")],
        principals: [
          new iam.CanonicalUserPrincipal(
            cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId
          ),
        ],
      })
    );

    const distribution = new cloudfront.Distribution(
      this,
      "AssetDistribution",
      {
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        defaultBehavior: {
          origin: new cloudfront_origins.S3Origin(assetBucket, {
            originAccessIdentity: cloudfrontOAI,
          }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      }
    );

    const { deployedBucket } = new s3deploy.BucketDeployment(
      this,
      "AssetDeployment",
      {
        sources: [],
        destinationBucket: assetBucket,
        distribution,
        distributionPaths: ["/*"],
      }
    );

    const plotLambda = new lambda.Function(this, "PlotLambda", {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromAssetImage(join(__dirname, "../../lambda/plot")),
      environment: {
        S3_BUCKET_NAME: deployedBucket.bucketName,
      },
      timeout: Duration.minutes(3),
    });

    deployedBucket.grantPut(plotLambda);

    const secret = new secretsmanager.Secret(this, "Secret", {
      removalPolicy: RemovalPolicy.DESTROY,
      // デプロイ後に実際の値を手動で設定すること
      secretObjectValue: {
        SLACK_BOT_TOKEN: SecretValue.unsafePlainText("dummy"),
        SLACK_CHANNEL_TO_NOTIFY: SecretValue.unsafePlainText("dummy"),
      },
    });

    const notificationLambda = new lambda.Function(this, "NotificationLambda", {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromAssetImage(
        join(__dirname, "../../lambda/notification")
      ),
      environment: {
        SLACK_CREDENTIALS_SECRET_ID: secret.secretName,
        CLOUD_FRONT_DISTRIBUTION_URL:
          "https://" + distribution.distributionDomainName,
      },
    });

    secret.grantRead(notificationLambda);

    const plotLambdaTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      "PlotLambdaTask",
      {
        lambdaFunction: plotLambda,
      }
    );

    const notificationLambdaTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      "NotificationLambdaTask",
      { lambdaFunction: notificationLambda }
    );

    const definition = plotLambdaTask.next(notificationLambdaTask);

    new stepfunctions.StateMachine(this, "StateMachine", { definition });
  }
}
