from slack_sdk import WebClient
import boto3
import os
import json


def main(event, context):
    file_name = event["Payload"]["file_name"]

    notify_slack(file_name, "ファイルがアップロードされました")


def notify_slack(file_name: str, message: str):
    secretsmanager_client = boto3.client("secretsmanager")

    secret_id = os.environ["SLACK_CREDENTIALS_SECRET_ID"]

    secret_value = secretsmanager_client.get_secret_value(SecretId=secret_id)
    secret = json.loads(secret_value["SecretString"])

    slack_token = secret["SLACK_BOT_TOKEN"]
    channel = secret["SLACK_CHANNEL_TO_NOTIFY"]

    client = WebClient(token=slack_token)

    image_url = os.environ["CLOUD_FRONT_DISTRIBUTION_URL"] + "/" + file_name

    client.chat_postMessage(
        channel=channel,
        blocks=[
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": message},
                "accessory": {
                    "type": "image",
                    "image_url": image_url,
                    "alt_text": file_name,
                },
            }
        ],
    )
