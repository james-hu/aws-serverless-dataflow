aws-serverless-dataflow
=======================

Visualisation of AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/aws-serverless-dataflow.svg)](https://npmjs.org/package/aws-serverless-dataflow)
[![Downloads/week](https://img.shields.io/npm/dw/aws-serverless-dataflow.svg)](https://npmjs.org/package/aws-serverless-dataflow)
[![License](https://img.shields.io/npm/l/aws-serverless-dataflow.svg)](https://github.com/james-hu/aws-serverless-dataflow/blob/master/package.json)

This is a command line tool for visualising the connections among AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) components. To run it, you need to log into your AWS account from command line first.

Typical usage:

```sh-session
$ npx aws-serverless-dataflow -r ap-southeast-2 -s
npx: installed 127 in 11.303s
Suveying API Gateway and SQS... done
Suveying SNS... done
Suveying Lambda... done
Generating static website content in 'dataflow'... done
Local server started. Ctrl-C to stop. Access URL: http://localhost:8002/
```

The diagram can be viewed from a browser. This is what the diagram looks like:

![Screenshot](doc/aws-serverless-dataflow_screenshot.png)

You can host the generated static files on a website if you like.

Command line option `-r ap-southeast-2` specifies AWS region,
`-s` tells the command line to start up a local http server and then open the browser pointing to that local server for viewing generated content.

If you don't want to include all the resources,
you can use `--include` and `--exclude` options to specify which to include and which to exclude.
Both of them can have multiple appearances.
A resource would be included if any of the `--include` wild card patterns matches and none of the `--include` wild card patterns matches.

`-c` or `--cloud-formation` would enable clustering resouces by CloudFormation stacks.
It is useful when you would like to have a high level view.

## Usage

You can have it installed globally like this:

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

By passing `-h` or `--help` to the command line, you can see all supported arguments and options.

## Arguments

```sh-session
  PATH  [default: dataflow] path for putting generated website files
```

## Options

```sh-session
  -c, --cloud-formation  survey CloudFormation stack information (this takes more time)
  -d, --debug            output debug messages
  -h, --help             show CLI help
  -i, --include=include  [default: *] wildcard patterns for domain names and ARN of Lambda functions/SNS topics/SQS queues that should be includeed
  -p, --port=port        [default: 8002] port number of the local http server for preview
  -q, --quiet            no console output
  -r, --region=region    AWS region
  -s, --server           start a local http server and open a browser for pre-viewing generated website
  -v, --version          show CLI version
  -x, --exclude=exclude  wildcard patterns for domain names and ARN of Lambda functions/SNS topics/SQS queues that should be excluded
```

## Description

```sh-session
  This command line tool can visualise AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow.
  It generates website files locally and can optionally launch a local server for you to preview.
  Before running this tool, you need to log into your AWS account (through command line like aws, saml2aws, okta-aws, etc.) first.
```
