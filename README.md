aws-serverless-dataflow
=======================

Visualisation of AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) components

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/aws-serverless-dataflow.svg)](https://npmjs.org/package/aws-serverless-dataflow)
[![Downloads/week](https://img.shields.io/npm/dw/aws-serverless-dataflow.svg)](https://npmjs.org/package/aws-serverless-dataflow)
[![License](https://img.shields.io/npm/l/aws-serverless-dataflow.svg)](https://github.com/james-hu/aws-serverless-dataflow/blob/master/package.json)

_aws-serverless-dataflow_ is a command line tool that can help you visualize the connections and dataflow among various AWS serverless components, such as AWS Lambda, API Gateway, SNS, SQS, etc. The tool surveys the serverless components in your AWS account, and then generates static website content that can be hosted on a website for viewing the diagrams.

The generated visual representation can help you to understand the architecture and data flow of their serverless application, and identify any issues or opportunities for optimization. 

## Quick start

_aws-serverless-dataflow_ can be installed through Homebrew (`brew install handy-common-utils/tap/aws-serverless-dataflow` for Linux or MacOS),
[snap](https://snapcraft.io/aws-serverless-dataflow) (`snap install aws-serverless-dataflow` for Linux except WSL), npm (`npm i -g aws-serverless-dataflow` for any system with Node.js installed), or manual download (https://github.com/james-hu/aws-serverless-dataflow/releases for Windows, Linux, and MacOS ). It can also be executed without installation through npx (`npx aws-serverless-dataflow` for any system with Node.js installed).

Before running it, you need to log into your AWS account [through command line](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html) first.

Then, you can try something like this:

```sh-session
$ npx aws-serverless-dataflow -r ap-southeast-2 -i '*boi*' -i '*datahub*' -x '*jameshu*' -c -s
Surveyed 11/42 domains in API Gateway
Surveyed 72/224 queues in SQS
Surveyed 48/209 topics in SNS
Surveyed 65/250 subscriptions in SNS
Surveyed 100/1115 stacks in CloudFormation
Surveyed 120 APIs in API Gateway
(1/2) Surveying API Gateway, SQS, SNS and CloudFormation... done
Surveyed 85/410 buckets in S3
Surveyed 120/464 functions in Lambda
(2/2) Surveying S3 and Lambda... done
Finished survey in 72.672 seconds
Generating static website content in 'dataflow'... done
Local server started. Ctrl-C to stop. Access URL: http://localhost:8002/
```

The command line in the example above searches for components in _ap-southeast-2_ region
having _boi_ or _datahub_ in but not _jameshu_ in the ARN,
and finds out which CloudFormation stack each component belongs to,
stores the generated files in _./dataflow/_ directory,
then launches a local web server at _http://localhost:8002/_
and opens the local website in the default browser.

This is what the website looks like:

![Screenshot](doc/aws-serverless-dataflow_screenshot.png)

You can copy and host the generated static content files on your own website if you'd like to.

Command line option `-r ap-southeast-2` specifies AWS region,
`-s` tells the command line to start up a local web server and then open the local website in the default browser for viewing generated content.

If you don't want to include all the resources,
you can use `--include`/`-i` and `--exclude`/`-x` options to specify which to include and which to exclude.
Both of them can have multiple appearances in the command line.
A resource would be included if any of the `--include` wild card patterns matches and none of the `--exclude` wild card patterns matches.

It may take a while for this tool to survey all relevant resources in your AWS account.
To make it faster, you can try to increase parallelism by changing `--parallelism`/`-l` option which by default has a value of 4.
If you see `TooManyRequestsException: Rate exceeded` error, you can try decreasing it.

`-c` or `--cloud-formation` would enable clustering resouces by CloudFormation stacks.
It is useful when you would like to have a high level view.

By passing `-h` or `--help` to the command line, you can see all supported arguments and options.

For more information on how to use _aws-serverless-dataflow_ and the available options and arguments, visit https://github.com/james-hu/aws-serverless-dataflow or run the `aws-serverless-dataflow --help` command.

## Usage

<!-- help start -->
```
USAGE
  $ aws-serverless-dataflow  [PATH] [-v] [-h] [-r <value>] [-i
    <value>] [-x <value>] [-c] [-s] [-p <value>] [-l <value>] [-q] [-d]

ARGUMENTS
  PATH  [default: dataflow] path for putting generated website files

FLAGS
  -c, --cloud-formation      survey CloudFormation stack information (this takes
                             more time)
  -d, --debug                output debug messages
  -h, --help                 Show CLI help.
  -i, --include=<value>...   [default: *] wildcard patterns for domain names and
                             ARN of Lambda functions/SNS topics/SQS queues that
                             should be includeed
  -l, --parallelism=<value>  [default: 4] approximately how many AWS API calls
                             are allowed at the same time
  -p, --port=<value>         [default: 8002] port number of the local http
                             server for preview
  -q, --quiet                no console output
  -r, --region=<value>       AWS region (required if you don't have AWS_REGION
                             environment variable configured)
  -s, --server               start a local http server and open a browser for
                             pre-viewing generated website
  -v, --version              Show CLI version.
  -x, --exclude=<value>...   wildcard patterns for domain names and ARN of
                             Lambda functions/SNS topics/SQS queues that should
                             be excluded

DESCRIPTION
  Visualisation of AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow

  This command line tool can visualise AWS serverless (Lambda, API Gateway, SNS,
  SQS, etc.) dataflow. It generates website files locally and can optionally
  launch a local server for you to preview.

  Before running this tool, you need to log into your AWS account (through
  command line like aws, saml2aws, okta-aws, etc.) first.

  This tool is free and open source:
  https://github.com/james-hu/aws-serverless-dataflow

EXAMPLES
  $ aws-serverless-dataflow -r ap-southeast-2 -s

  $ aws-serverless-dataflow -r ap-southeast-2 -s -i '*boi*' -i '*datahub*' \
        -x '*jameshu*' -c

  $ aws-serverless-dataflow -r ap-southeast-2 -s -i '*lr-*' \
        -i '*lead*' -x '*slack*' -x '*lead-prioritization*' \
        -x '*lead-scor*' -x '*LeadCapture*' -c
```

<!-- help end -->

## Contributing

Development:

- Run for test: `./bin/run ...`
- Release: `npm version patch -m "..." && npm publish`

Please ignore `main.go` and `go.mod` files.
They exist only because we are using *goreleaser*.

To build binaries for arm64 processors, you need a Linux machine, with binfmt and ldid installed:
- https://hub.docker.com/r/tonistiigi/binfmt
- https://stackoverflow.com/a/27769297

To debug goreleaser:

```GITHUB_TOKEN=<the-token> goreleaser release --skip-validate --rm-dist --debug```
