aws-serverless-dataflow
=======================

Visualisation of AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/aws-serverless-dataflow.svg)](https://npmjs.org/package/aws-serverless-dataflow)
[![Downloads/week](https://img.shields.io/npm/dw/aws-serverless-dataflow.svg)](https://npmjs.org/package/aws-serverless-dataflow)
[![License](https://img.shields.io/npm/l/aws-serverless-dataflow.svg)](https://github.com/james-hu/aws-serverless-dataflow/blob/master/package.json)

This is a command line tool for visualising the connections among AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) components. To run it, you need to log into your AWS account from command line first.

Typical usage (you don't need Node.js environment and npx if you have downloaded [precompiled binaries for MacOS/Windows/Linux](https://github.com/james-hu/aws-serverless-dataflow/releases)):

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

The diagram can be viewed from a browser. This is what the diagram looks like:

![Screenshot](doc/aws-serverless-dataflow_screenshot.png)

You can host the generated static files on a website if you like.

Command line option `-r ap-southeast-2` specifies AWS region,
`-s` tells the command line to start up a local http server and then open the browser pointing to that local server for viewing generated content.

If you don't want to include all the resources,
you can use `--include`/`-i` and `--exclude`/`-x` options to specify which to include and which to exclude.
Both of them can have multiple appearances.
A resource would be included if any of the `--include` wild card patterns matches and none of the `--include` wild card patterns matches.

It may take a while for this tool to survey all relevant resources in your AWS account.
To make it faster, you can try to increase parallelism by changing `--parallelism`/`-l` option which by default is 4.
If you see `TooManyRequestsException: Rate exceeded` error, you can try decreasing it.

`-c` or `--cloud-formation` would enable clustering resouces by CloudFormation stacks.
It is useful when you would like to have a high level view.

## Quick start

### Option 1: download precompiled binaries 

Precompiled binaries can be downloaded from the [release page on GitHub](https://github.com/james-hu/aws-serverless-dataflow/releases).

You just need to download the version matching your OS (Windows, MacOS, or Linux) and then run it from a terminal/command window.

### Option 2: install as NPM package

If [Node.js](https://nodejs.org/) has already been installed in the computer,
you can have aws-serverless-dataflow installed globally like this:

```sh-session
$ npm install -g aws-serverless-dataflow
$ aws-serverless-dataflow ...
...
```

Or, you can just invoke the latest version with `npx`:

```sh-session
$ npx aws-serverless-dataflow ...
...
```

### --help

By passing `-h` or `--help` to the command line, you can see all supported arguments and options.

## Manual

<!-- help start -->
```
USAGE
  $ aws-serverless-dataflow [PATH]

ARGUMENTS
  PATH  [default: dataflow] path for putting generated website files

OPTIONS
  -c, --cloud-formation          survey CloudFormation stack information (this
                                 takes more time)

  -d, --debug                    output debug messages

  -h, --help                     show CLI help

  -i, --include=include          [default: *] wildcard patterns for domain names
                                 and ARN of Lambda functions/SNS topics/SQS
                                 queues that should be includeed

  -l, --parallelism=parallelism  [default: 4] approximately how many AWS API
                                 calls are allowed at the same time

  -p, --port=port                [default: 8002] port number of the local http
                                 server for preview

  -q, --quiet                    no console output

  -r, --region=region            AWS region (required if you don't have
                                 AWS_REGION environment variable configured)

  -s, --server                   start a local http server and open a browser
                                 for pre-viewing generated website

  -v, --version                  show CLI version

  -x, --exclude=exclude          wildcard patterns for domain names and ARN of
                                 Lambda functions/SNS topics/SQS queues that
                                 should be excluded

DESCRIPTION
  This command line tool can visualise AWS serverless (Lambda, API Gateway, SNS, 
  SQS, etc.) dataflow. It generates website files locally and can optionally 
  launch a local server for you to preview.

  Before running this tool, you need to log into your AWS account (through 
  command line like aws, saml2aws, okta-aws, etc.) first. 

  This tool is free and open source: 
  https://github.com/james-hu/aws-serverless-dataflow

EXAMPLES
  aws-serverless-dataflow -r ap-southeast-2 -s
  aws-serverless-dataflow -r ap-southeast-2 -s -i '*boi*' -i '*datahub*' \
         -x '*jameshu*' -c
  aws-serverless-dataflow -r ap-southeast-2 -s -i '*lr-*' \
         -i '*lead*' -x '*slack*' -x '*lead-prioritization*' \
         -x '*lead-scor*' -x '*LeadCapture*' -c
```

<!-- help end -->

## For developers

* Run for test: `./bin/run ...`
* Release: `npm version patch -m "..." && npm publish`
