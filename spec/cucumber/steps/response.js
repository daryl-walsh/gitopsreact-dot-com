import assert, { AssertionError } from 'assert'
import { When, Then } from 'cucumber'
import elasticsearch from 'elasticsearch'
// import { Client, ApiResponse, RequestParams } from '@elastic/elasticsearch'
import { decode } from 'jsonwebtoken'
import objectPath from 'object-path'
import { convertStringToArray } from './utils'

// const client = new elasticsearch.Client({
//   host: `${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
// })

//  var client = new elasticsearch.Client({
//   host: `${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
//   log: 'trace',
//   apiVersion: '7.4',
// })
// const client = new Client({
//   node: `${process.env.ELASTICSEARCH_PROTOCOL}://${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
// })
var client = new elasticsearch.Client({
  // host: 'localhost:9200',
  host: `${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
  log: 'trace',
  apiVersion: process.env.ELASTICSEARCH_VERSION, // use the same version of your Elasticsearch instance
})

When(/^saves the response text in the context under ([\w.]+)$/, function(
  contextPath
) {
  objectPath.set(this, contextPath, this.response.text)
})

Then(/^our API should respond with a ([1-5]\d{2}) HTTP status code$/, function(
  statusCode
) {
  assert.equal(this.response.statusCode, statusCode)
})

Then(/^the payload of the response should be an? ([a-zA-Z0-9, ]+)$/, function(
  payloadType
) {
  const contentType =
    this.response.headers['Content-Type'] ||
    this.response.headers['content-type']
  if (payloadType === 'JSON object' || payloadType === 'array') {
    // Check Content-Type header
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response not of Content-Type application/json')
    }

    // Check it is valid JSON
    try {
      this.responsePayload = JSON.parse(this.response.text)
    } catch (e) {
      throw new Error('Response not a valid JSON object')
    }
  } else if (payloadType === 'string') {
    // Check Content-Type header
    if (!contentType || !contentType.includes('text/plain')) {
      throw new Error('Response not of Content-Type text/plain')
    }

    // Check it is a string
    this.responsePayload = this.response.text
    if (typeof this.responsePayload !== 'string') {
      throw new Error('Response not a string')
    }
  }
})

Then(/^contains a message property which says (?:"|')(.*)(?:"|')$/, function(
  message
) {
  assert.equal(this.responsePayload.message, message)
})

Then(
  /^the payload object should be added to the database, grouped under the "([a-zA-Z]+)" type$/,
  function(type) {
    this.type = type
    return client
      .get({
        index: process.env.ELASTICSEARCH_INDEX,
        type,
        id: this.responsePayload,
      })
      .then(result => {
        assert.deepEqual(result._source, this.requestPayload)
      })
  }
)

Then(
  /^the ([\w.]+) property of the response should be the same as context\.([\w.]+)$/,
  function(responseProperty, contextProperty) {
    assert.deepEqual(
      objectPath.get(
        this.responsePayload,
        responseProperty === 'root' ? '' : responseProperty
      ),
      objectPath.get(this, contextProperty)
    )
  }
)

Then(
  /^the ([\w.]+) property of the response should be the same as context\.([\w.]+) but without the ([\w.]+) fields?$/,
  function(responseProperty, contextProperty, missingFields) {
    const contextObject = objectPath.get(this, contextProperty)
    const fieldsToDelete = convertStringToArray(missingFields)
    fieldsToDelete.forEach(field => delete contextObject[field])
    assert.deepEqual(
      objectPath.get(
        this.responsePayload,
        responseProperty === 'root' ? '' : responseProperty
      ),
      contextObject
    )
  }
)

Then(
  /^the ([\w.]+) property of the response should be an? ([\w.]+) with the value (.+)$/,
  function(responseProperty, expectedResponseType, expectedResponse) {
    const parsedExpectedResponse = (function() {
      switch (expectedResponseType) {
        case 'object':
          return JSON.parse(expectedResponse)
        case 'string':
          return expectedResponse.replace(/^(?:["'])(.*)(?:["'])$/, '$1')
        default:
          return expectedResponse
      }
    })()
    assert.deepEqual(
      objectPath.get(
        this.responsePayload,
        responseProperty === 'root' ? '' : responseProperty
      ),
      parsedExpectedResponse
    )
  }
)

Then(
  /^the first item of the response should have property ([\w.]+) set to (.+)$/,
  function(path, value) {
    assert.equal(objectPath.get(this.responsePayload[0], path), value)
  }
)

Then(/^the response should contain (\d+) items$/, function(count) {
  assert.equal(this.responsePayload.length, count)
})

Then(/^the payload should be equal to context.([\w-]+)$/, function(
  contextpath
) {
  assert.equal(this.responsePayload, objectPath.get(this, contextpath))
})

Then(
  /^the response string should satisfy the regular expression (.+)$/,
  function(regex) {
    const re = new RegExp(regex.trim().replace(/^\/|\/$/g, ''))
    assert.equal(re.test(this.responsePayload), true)
  }
)

Then(
  /^the JWT payload should have a claim with name (\w+) equal to context.([\w-]+)$/,
  function(claimName, contextPath) {
    const decodedTokenPayload = decode(this.responsePayload)
    if (decodedTokenPayload === null) {
      throw new AssertionError()
    }
    assert.equal(
      decodedTokenPayload[claimName],
      objectPath.get(this, contextPath)
    )
  }
)
