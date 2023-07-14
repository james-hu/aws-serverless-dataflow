#!/usr/bin/env node

process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE='1';

// if running as a snap app, $HOME is not the real home
if (process.env.SNAP_REAL_HOME && process.env.SNAP_REAL_HOME !== process.env.HOME) {
  if (!process.env.AWS_SDK_LOAD_CONFIG) {
    process.env.AWS_SDK_LOAD_CONFIG = '1';
  }
  if (!process.env.AWS_CONFIG_FILE) {
    process.env.AWS_CONFIG_FILE = `${process.env.SNAP_REAL_HOME}/.aws/config`;
  }
  if (!process.env.AWS_SHARED_CREDENTIALS_FILE) {
    process.env.AWS_SHARED_CREDENTIALS_FILE = `${process.env.SNAP_REAL_HOME}/.aws/credentials`;
  }
}

const path = require('path')
const oclif = require('@oclif/core')

require('../lib')
  .run()
  .then(oclif.flush)
  .catch(oclif.Errors.handle)
