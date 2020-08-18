const { defaultPostRequestConfig, defaultGetRequestConfig, defaultRequestConfig, getHashFromArray, getFieldValueFromMessage, flattenJson } = require("../../util");
const { EventType } = require("../../../constants");

const getPropertyParams = (message) => {
  if (message.type === EventType.IDENTIFY) {
    return flattenJson(getFieldValueFromMessage(message, "traits"));
  }
  return flattenJson(message.properties);
}

function process(event){
  const { message, destination } = event;
  const response = defaultRequestConfig();
  const url = destination.Config.webhookUrl;
  const method = destination.Config.webhookMethod;
  const headers = destination.Config.headers;

  if(url){
  
    if (method === defaultGetRequestConfig.requestMethod) {
      response.method = defaultGetRequestConfig.requestMethod;
      // send properties as query params for GET
      response.params = getPropertyParams(message);
    } else {
      response.method = defaultPostRequestConfig.requestMethod;
      response.body.JSON = message;
      response.headers = {
        "Content-Type" : "application/json"
      };
    }

    Object.assign(response.headers, getHashFromArray(headers));
    response.userId = getFieldValueFromMessage(message, "userId");
    response.endpoint = url;
    
    return response;
  }
  throw new Error("Invalid URL in destination config");
}

exports.process = process;