#!/usr/bin/env node

const path = require('path')
const oclif = require('@oclif/core')

require('../lib')
  .run()
  .then(oclif.flush)
  .catch(oclif.Errors.handle)
