const get = require("get-value");
const set = require("set-value");
const axios = require("axios");

const { EventType } = require("../../constants");
const { ConfigCategory, mappingConfig, ENDPOINT, defaultUserFields } = require("./config");
const {
  removeUndefinedValues,
  defaultPostRequestConfig,
  defaultRequestConfig
} = require("../util");

function getIdentifyPayload(message, category, destination) {
  mappingJson = mappingConfig[category.name];
  const rawPayload = {};

  const sourceKeys = Object.keys(mappingJson);
  sourceKeys.forEach(sourceKey => {
    set(rawPayload, mappingJson[sourceKey], get(message, sourceKey));
  });
  
  if (destination.Config.createUsersAsVerified) {
    set(rawPayload, "user.verified", true);
  }
  rawPayload.user = removeUndefinedValues(rawPayload.user);

  const trait_keys = Object.keys(message.context.traits);
  const user_fields = trait_keys.filter(trait => !(sourceKeys.includes("context.traits."+trait)));
  user_fields.forEach(field => {
    set(rawPayload, "user.user_fields."+field, get(message, "context.traits."+field));
  });

  return rawPayload;
}

function responseBuilderSimple(message, category, destination, headers, payload) {
  const response = defaultRequestConfig();
  response.endpoint = "https://" + destination.Config.domain + ENDPOINT + category.action;
  response.method = defaultPostRequestConfig.requestMethod;
  response.headers = headers;
  response.userId = message.userId ? message.userId : message.anonymousId;
  response.body.JSON = payload;
  // console.log(response);

  return response;
}

async function createUserFields(url, config, new_fields) {
  let field_data;
  new_fields.forEach(async (field) => {
    field_data = {
      "user_field": {
        "title": field,
        "active": true,
        "key": field,
        "description": field
      }
    };
    try {
      let response = await axios.post(url, field_data, config);
      if(response.status !== 201) {
        console.log("Failed to create User Field : ", field);
      }
    }
    catch(error) {
      if (error.response.status !== 422 && error.response.data.details.key.error !=="DuplicateValue") {
        console.log("Cannot create User field ", field, error);
      }
    }
    }
  );
  
}


async function checkAndCreateUserFields(traits, headers, destination) {
  let new_fields = [];
  
  let url  = "https://" + destination.Config.domain + ENDPOINT + "user_fields.json";
  let config = {'headers': headers};
  
  try {
    let response = await axios.get(url, config);
    let existing_keys = response.data.user_fields.map(field => field.key);
    existing_keys = existing_keys.concat(defaultUserFields);

    const trait_keys = Object.keys(traits);
    new_fields = trait_keys.filter((key => !(existing_keys.includes(key))));

    if(new_fields.length > 0)
       await createUserFields(url, config, new_fields);
  }
  catch(error) {
    error.response ? console.log("Error :", error.response.data) : console.log("Error :",error);
  }
}

async function processSingleMessage(message, destination) {
  const messageType = message.type.toLowerCase();
  let category;
  let payload;
  let unencodedBase64Str = destination.Config.email+":"+destination.Config.password;
  let headers = {
    Authorization: 'Basic ' + Buffer.from(unencodedBase64Str).toString("base64"),
    'Content-Type': 'application/json'
  };

  switch (messageType) {
    case EventType.IDENTIFY:
      category = ConfigCategory.IDENTIFY;
      await checkAndCreateUserFields(message.context.traits, headers, destination);
      payload = getIdentifyPayload(message, category, destination);
      break;
    default:
      throw new Error("Message type not supported");
  }
  
  return responseBuilderSimple(message, category, destination, headers, payload);
}

async function process(event) {
  let resp = await processSingleMessage(event.message, event.destination);
  return resp;
}

exports.process = process;