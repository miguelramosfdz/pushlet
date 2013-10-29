var redis = require('redis'),
    log  = require('./log').logger;

var config = require('./config.json');

// set up redis
var port = config.redis.port || 6379,
    host = config.redis.host || 'localhost';

var redisClient = redis.createClient(port, host);
redisClient.on("error", function (err) {
  log.error("Redis Error: " + err);
});

function authenticateAndHandleRequest(request, response, handler) {
  if (handler.authProvided(request)) {
    // If a certificate is provided, store it in redis
    log.debug("New auth provided in request");
    handleNewAuth(request, response, handler);
  } else {
    log.debug("No auth provided, attempt to look up in the cache");
    handleExistingAuth(request, response, handler);
  }
}

// auth passed in, yay!
function handleNewAuth (request, response, handler) {
  var appId = request.body.appId,
      mode  = request.body.mode,
      cert  = request.body.cert,
      key   = request.body.key;

  if (redisClient && redisClient.connected) {
    redisClient.multi(handler.setAuthData(appId, mode, key, cert)).exec(function (err, replies) {
      log.debug("Saved auth in Redis");
      handler.sendMessage(request, response);
    });
  } else {
    log.info("No Redis connection, can't store auth credentials");
    handler.sendMessage(request, response);
  }
}

// if there is no key or cert, see if one can be found
function handleExistingAuth (request, response, handler) {
  var appId = request.body.appId,
      mode  = request.body.mode;

  // check redis for an existing auth for this appId
  if (redisClient && redisClient.connected) {
    redisClient.multi(handler.getAuthData(appId, mode)).exec(function(err, replies) {
      handler.authCallback(err, replies, request, response, appId, mode);
    });
  } else {
    log.info("No Redis connection, can't check for existing credentials");
    response.end(responder.err({ error: "Internal Server Error" }));
  }
}

exports.authenticateAndHandleRequest = authenticateAndHandleRequest;
