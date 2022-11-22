import seaborn as sns
import matplotlib.pyplot as plt
import boto3
import os
from pathlib import PurePath


def main(event, context):
    file_path = "/tmp/sample.png"

    plot_and_save_to_file(file_path)

    upload_file_to_s3(file_path)

    return {"file_name": PurePath(file_path).name}


def plot_and_save_to_file(file_path: str):
    sns.set_theme(style="ticks")

    df = sns.load_dataset("anscombe")

    sns.lmplot(
        data=df,
        x="x",
        y="y",
        col="dataset",
        hue="dataset",
        col_wrap=2,
        palette="muted",
        ci=None,
        height=4,
        scatter_kws={"s": 50, "alpha": 1},
    )

    plt.savefig(file_path)


def upload_file_to_s3(file_path: str):
    S3_BUCKET_NAME = os.environ["S3_BUCKET_NAME"]

    s3 = boto3.resource("s3")

    obj = s3.Object(S3_BUCKET_NAME, PurePath(file_path).name)

    obj.upload_file(file_path)
