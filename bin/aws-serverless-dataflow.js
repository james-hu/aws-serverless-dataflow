#!/usr/bin/env node

process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE='1';

const path = require('path')
const oclif = require('@oclif/core')

require('../lib')
  .run()
  .then(oclif.flush)
  .catch(oclif.Errors.handle)
