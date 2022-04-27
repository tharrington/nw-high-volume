// 3rd party dependencies
const path = require('path'),
  express = require('express'),
  session = require('express-session'),
  jsforce = require('jsforce');
const yields = require('express-yields');

const axios = require('axios');
const { create } = require('xmlbuilder2');

const cron = require('node-cron');

const {custom} = require("@salesforce-ux/design-system/design-tokens/dist/bg-standard.common");


// Load and check config
require('dotenv').config();
if (!(process.env.loginUrl && process.env.consumerKey && process.env.consumerSecret && process.env.callbackUrl && process.env.apiVersion && process.env.sessionSecretKey)) {
  console.error('Cannot start app: missing mandatory configuration. Check your .env file.');
  process.exit(-1);
}

// Instantiate Salesforce client with .env configuration
let oauth2;

// Setup HTTP server
const app = express();
const port = process.env.PORT || 8080;
app.set('port', port);

// Enable server-side sessions
app.use(
  session({
    secret: process.env.sessionSecretKey,
    cookie: { secure: process.env.isHttps === 'true' },
    resave: false,
    saveUninitialized: false
  })
);

// Serve HTML pages under root directory
app.use('/', express.static(path.join(__dirname, '../public')));

/**
 *  Attemps to retrieves the server session.
 *  If there is no session, redirects with HTTP 401 and an error message
 */
function getSession(request, response) {
  const session = request.session;
  if (!session.sfdcAuth) {
    response.status(401).send('No active session');
    return null;
  }
  return session;
}

function resumeSalesforceConnection(session) {
  return new jsforce.Connection({
    instanceUrl: session.sfdcAuth.instanceUrl,
    accessToken: session.sfdcAuth.accessToken,
    version: process.env.apiVersion
  });
}

/**
 * Login endpoint
 */
app.get('/auth/login', (request, response) => {
  if(!request.query.loginUrl ||  !request.query.consumerKey || !request.query.callbackUrl || !request.query.consumerSecret) {
    response.status(500).send('Please enter all values before logging in.');
    return;
  }
  console.log('### got query');
  console.log('### query: ' + JSON.stringify(request.query));
  oauth2 = new jsforce.OAuth2({
    loginUrl: request.query.loginUrl,
    clientId: request.query.consumerKey,
    clientSecret: request.query.consumerSecret,
    redirectUri: request.query.callbackUrl
  });


  // Redirect to Salesforce login/authorization page
  response.redirect(oauth2.getAuthorizationUrl({ scope: 'api' }));
});

/**
 * Login callback endpoint (only called by Salesforce)
 */
app.get('/auth/callback', (request, response) => {
  if (!request.query.code) {
    response.status(500).send('Failed to get authorization code from server callback.');
    return;
  }

  // Authenticate with OAuth
  const conn = new jsforce.Connection({
    oauth2: oauth2,
    version: process.env.apiVersion
  });
  conn.authorize(request.query.code, (error, userInfo) => {
    if (error) {
      console.log('Salesforce authorization error: ' + JSON.stringify(error));
      response.status(500).json(error);
      return;
    }

    // Store oauth session data in server (never expose it directly to client)
    request.session.sfdcAuth = {
      instanceUrl: conn.instanceUrl,
      accessToken: conn.accessToken
    };
    // Redirect to app main page
    return response.redirect('/index.html');
  });
});

/**
 * Logout endpoint
 */
app.get('/auth/logout', (request, response) => {
  const session = getSession(request, response);
  if (session == null) return;

  // Revoke OAuth token
  const conn = resumeSalesforceConnection(session);
  conn.logout((error) => {
    if (error) {
      console.error('Salesforce OAuth revoke error: ' + JSON.stringify(error));
      response.status(500).json(error);
      return;
    }

    // Destroy server-side session
    session.destroy((error) => {
      if (error) {
        console.error('Salesforce session destruction error: ' + JSON.stringify(error));
      }
    });

    // Redirect to app main page
    return response.redirect('/index.html');
  });
});

/**
 * Endpoint for retrieving currently connected user
 */
app.get('/auth/whoami', (request, response) => {
  const session = getSession(request, response);
  if (session == null) {
    return;
  }

  // Request session info from Salesforce
  const conn = resumeSalesforceConnection(session);
  conn.identity((error, res) => {
    response.send(res);
  });
});


/**
 * Endpoint for performing a SOQL query on Salesforce
 */
app.get('/query', (request, response) => {
  const session = getSession(request, response);
  if (session == null) {
    return;
  }

  const query = 'select Id,NWSHOP__Client_ID_Num__c, NWSHOP__Client_Case_Num__c, NWSHOP__Client_SSN1__c, NWSHOP__Client_SSN2__c, NWSHOP__Client_First_Name__c, NWSHOP__Client_Last_Name__c, NWSHOP__Client_Middle_Name__c, \n' +
    '                   NWSHOP__Client_Street_Address_1__c, NWSHOP__Client_Street_Address_2__c, NWSHOP__Client_State__c, NWSHOP__Client_Zip__c, NWSHOP__Client_New_Street_Address_1__c, NWSHOP__Client_New_Street_Address_2__c, \n' +
    '                   NWSHOP__Client_New_City__c, NWSHOP__Client_New_State__c, NWSHOP__Client_New_Zip__c, NWSHOP__Client_Phone_Num__c, NWSHOP__Client_Mobile_Phone_Num__c, NWSHOP__Client_Fax__c, NWSHOP__Client_Email__c, NWSHOP__Client_Family_Size__c, \n' +
    '                   NWSHOP__Client_Gender__c, NWSHOP__Client_Marital_Status__c, NWSHOP__Client_Race_ID__c, NWSHOP__Client_Ethnicity_ID__c, NWSHOP__Client_Household_Gross_Monthly_Income__c, NWSHOP__Client_Head_Of_Household_Type__c, \n' +
    '                   NWSHOP__Client_Birth_DT__c, NWSHOP__Client_Counselor_ID__c, NWSHOP__Client_Counselor_HUD_Id__c, NWSHOP__Client_Highest_Educ_Grade__c, NWSHOP__Client_Farm_Worker__c, NWSHOP__Client_Rural_Area__c, NWSHOP__Client_Limited_English_Proficiency__c, \n' +
    '                   NWSHOP__Client_Colonias_Resident__c, NWSHOP__Client_HUD_Assistance__c, NWSHOP__Client_Disabled__c, NWSHOP__Client_Dependents_Num__c, NWSHOP__Client_Intake_DT__c, NWSHOP__Client_Counsel_Start_Session_DateTime__c, NWSHOP__Client_Counsel_End_Session_DateTime__c, \n' +
    '                   NWSHOP__Client_Language_Spoken__c, NWSHOP__Client_Session_Duration__c, NWSHOP__Client_Counseling_Type__c, NWSHOP__Client_Counseling_Termination__c, NWSHOP__Client_Counseling_Fee__c, NWSHOP__Client_Attribute_HUD_Grant__c, NWSHOP__Client_Grant_Amount_Used__c, \n' +
    '                   NWSHOP__Client_HECM_Certificate__c, NWSHOP__Client_HECM_Certificate_Issue_Date__c, NWSHOP__Client_HECM_Certificate_Expiration_Date__c, NWSHOP__Client_HECM_Certificate_ID__c, NWSHOP__Client_Predatory_Lending__c, NWSHOP__Client_Mortgage_Type__c, \n' +
    '                   NWSHOP__Client_Mortgage_Type_After__c, NWSHOP__Client_Finance_Type_Before__c, NWSHOP__Client_Finance_Type_After__c, NWSHOP__Client_FirstTime_Home_Buyer__c, NWSHOP__Client_Discrimination_Victim__c, NWSHOP__Client_Mortgage_Closing_Cost__c, \n' +
    '                   NWSHOP__Client_Mortgage_Interest_Rate__c, NWSHOP__Client_Referred_By__c, NWSHOP__Client_Sales_Contract_Signed__c, NWSHOP__Client_Credit_Score__c, NWSHOP__Client_No_Credit_Score_Reason__c, NWSHOP__Client_Credit_Score_Source__c, NWSHOP__Client_Job_Duration__c, \n' +
    '                   NWSHOP__Client_Household_Debt__c, NWSHOP__Client_Mortgage_Deliquency__c, NWSHOP__Client_Spouse_First_Name__c, NWSHOP__Client_Spouse_Last_Name__c, NWSHOP__Client_Spouse_Middle_Name__c, NWSHOP__Client_Spouse_SSN__c, NWSHOP__Client_Loan_Being_Reported__c, \n' +
    '                   NWSHOP__Client_Second_Loan_Exists__c, NWSHOP__Client_Intake_Loan_Type__c, NWSHOP__Client_Intake_Loan_Type_Is_Hybrid_ARM__c, NWSHOP__Client_Intake_Loan_Type_Is_Option_ARM__c, NWSHOP__Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c, \n' +
    '                   NWSHOP__Loan_Type_Is_Privately_Held__c, NWSHOP__Client_Intake_Loan_Type_Is_Interest_Only__c, NWSHOP__Client_Income_Level__c, NWSHOP__Client_Purpose_Of_Visit__c, NWSHOP__Client_Activity_Type__c, NWSHOP__Client_City__c, \n' +
    '                   NWSHOP__Loan_Type_Has_Interest_Rate_Reset__c, NWSHOP__Client_Outcome__c, NWSHOP__X9902ReportingQuarter__c from NWSHOP__X9902_Client__c where NWSHOP__X9902__c = \'' + request.query.q +'\'';
  console.log('### aaa query: ' + JSON.stringify(request.query));
  const settingVal = {
    Username__c: request.query.username,                                        // SEND PARAMS
    Password__c: request.query.password,                                      // SEND PARAMS
    EndpointURL__c: 'https://arm.hud.gov:9001/ARM/ARM',
    AgencyName__c: 'NWCompass',
    CMSPassword__c: 'M!Utzn6T',
    VendorID__c: '93',
    AgencyID__c: request.query.agencyid,     // grab from call
  };

  console.log('### query final: ' + query);
  if (!query) {
    response.status(400).send('Missing query parameter.');
    return;
  }
  const conn = resumeSalesforceConnection(session);

  // conn.query('SELECT Name, EndpointURL__c, AgencyId__c, AgencyName__c, Username__c, Password__c, CMSPassword__c, VendorId__c FROM NWSHOP__IntegrationSettings__c WHERE Name = \'HUD Settings\'', (error, customSetting) => {
    conn.query(query, (error, result) => {
      if (error) {
        console.error('Salesforce data API error: ' + JSON.stringify(error));
        response.status(500).json(error);
        return;
      } else {



        console.log('### settingVal: ' + JSON.stringify(settingVal));
        let authHeader = 'Basic ' + Buffer.from(settingVal.Username__c + ':' + settingVal.Password__c).toString('base64');
        console.log('### authHeader: ' + authHeader);

        let root = create({ version: '1.0', encoding: 'UTF-8' })
          .ele('tns:SubmissionData', {
            'xsi:schemaLocation': 'http://gov.hud.arm/client_profile_databag_6_0 client_profile_databag_6_0.xsd',
            'xmlns:tns' : 'http://gov.hud.arm/client_profile_databag_6_0',
            'xmlns:xsi' : 'http://www.w3.org/2001/XMLSchema-instance'
          }).ele('tns:Client_Profiles');

        for(let record of result.records) {
          const profile = root.ele('tns:Client_Profile');
          if(record.NWSHOP__Client_ID_Num__c) {
            profile.ele('tns:Client_ID_Num').txt(record.NWSHOP__Client_ID_Num__c).up();
          }
          if(record.NWSHOP__Client_Case_Num__c) {
            profile.ele('tns:Client_Case_Num').txt(record.NWSHOP__Client_Case_Num__c).up();
          }
          if(record.NWSHOP__Client_City__c) {
            profile.ele('tns:Client_City').txt(record.NWSHOP__Client_City__c).up();
          }
          if(record.NWSHOP__Client_State__c) {
            profile.ele('tns:Client_State').txt(record.NWSHOP__Client_State__c).up();
          }
          if(record.NWSHOP__Client_Zip__c) {
            profile.ele('tns:Client_Zip').txt(record.NWSHOP__Client_Zip__c).up();
          }
          if(record.NWSHOP__Client_New_City__c) {
            profile.ele('tns:Client_New_City').txt(record.NWSHOP__Client_New_City__c).up();
          }
          if(record.NWSHOP__Client_New_State__c) {
            profile.ele('tns:Client_New_State').txt(record.NWSHOP__Client_New_State__c).up();
          }
          if(record.NWSHOP__Client_New_Zip__c) {
            profile.ele('tns:Client_New_Zip').txt(record.NWSHOP__Client_New_Zip__c).up();
          }

          if(record.NWSHOP__Client_Family_Size__c) {
            profile.ele('tns:Client_Family_Size').txt(record.NWSHOP__Client_Family_Size__c).up();
          }
          if(record.NWSHOP__Client_Gender__c) {
            profile.ele('tns:Client_Gender').txt(record.NWSHOP__Client_Gender__c).up();
          }
          if(record.NWSHOP__Client_Marital_Status__c) {
            profile.ele('tns:Client_Marital_Status').txt(record.NWSHOP__Client_Marital_Status__c).up();
          }
          if(record.NWSHOP__Client_Race_ID__c) {
            profile.ele('tns:Client_Race_ID').txt(record.NWSHOP__Client_Race_ID__c).up();
          }
          if(record.NWSHOP__Client_Ethnicity_ID__c) {
            profile.ele('tns:Client_Ethnicity_ID').txt(record.NWSHOP__Client_Ethnicity_ID__c).up();
          }

          if(record.NWSHOP__Client_Household_Gross_Monthly_Income__c) {
            profile.ele('tns:Client_Household_Gross_Monthly_Income').txt(record.NWSHOP__Client_Household_Gross_Monthly_Income__c).up();
          }
          if(record.NWSHOP__Client_Head_Of_Household_Type__c) {
            profile.ele('tns:Client_Head_Of_Household_Type').txt(record.NWSHOP__Client_Head_Of_Household_Type__c).up();
          }
          if(record.NWSHOP__Client_Counselor_ID__c) {
            profile.ele('tns:Client_Counselor_ID').txt(record.NWSHOP__Client_Counselor_ID__c).up();
          }
          if(record.NWSHOP__Client_Counselor_HUD_Id__c) {
            profile.ele('tns:Client_Counselor_HUD_Id').txt(record.NWSHOP__Client_Counselor_HUD_Id__c).up();
          }
          if(record.NWSHOP__Client_Highest_Educ_Grade__c) {
            profile.ele('tns:Client_Highest_Educ_Grade').txt(record.NWSHOP__Client_Highest_Educ_Grade__c).up();
          }
          if(record.NWSHOP__Client_Farm_Worker__c) {
            profile.ele('tns:Client_Farm_Worker').txt(record.NWSHOP__Client_Farm_Worker__c).up();
          }
          if(record.NWSHOP__Client_Rural_Area__c) {
            profile.ele('tns:Client_Rural_Area').txt(record.NWSHOP__Client_Rural_Area__c).up();
          }
          if(record.NWSHOP__Client_Limited_English_Proficiency__c) {
            profile.ele('tns:Client_Limited_English_Proficiency').txt(record.NWSHOP__Client_Limited_English_Proficiency__c).up();
          }

          if(record.NWSHOP__Client_Colonias_Resident__c) {
            profile.ele('tns:Client_Colonias_Resident').txt(record.NWSHOP__Client_Colonias_Resident__c).up();
          }
          if(record.NWSHOP__Client_HUD_Assistance__c) {
            profile.ele('tns:Client_HUD_Assistance').txt(record.NWSHOP__Client_HUD_Assistance__c).up();
          }
          if(record.NWSHOP__Client_Disabled__c) {
            profile.ele('tns:Client_Disabled').txt(record.NWSHOP__Client_Disabled__c).up();
          }
          if(record.NWSHOP__Client_Dependents_Num__c !== null) {
            profile.ele('tns:Client_Dependents_Num').txt(record.NWSHOP__Client_Dependents_Num__c).up();
          }


          if(record.NWSHOP__Client_Intake_DT__c) {

            var date_format = new Date(record.NWSHOP__Client_Intake_DT__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_Intake_DT').txt(formatted_date).up();
          }
          if(record.NWSHOP__Client_Counsel_Start_Session_DateTime__c) {

            var date_format = new Date(record.NWSHOP__Client_Counsel_Start_Session_DateTime__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear() + ' 12:00';
            profile.ele('tns:Client_Counsel_Start_Session_DateTime').txt(formatted_date).up();
          }
          if(record.NWSHOP__Client_Counsel_End_Session_DateTime__c) {

            var date_format = new Date(record.NWSHOP__Client_Counsel_End_Session_DateTime__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear() + ' 12:00';

            profile.ele('tns:Client_Counsel_End_Session_DateTime').txt(formatted_date).up();
          }

          if(record.NWSHOP__Client_Language_Spoken__c) {
            profile.ele('tns:Client_Language_Spoken').txt(record.NWSHOP__Client_Language_Spoken__c).up();
          }
          if(record.NWSHOP__Client_Session_Duration__c !== null) {
            profile.ele('tns:Client_Session_Duration').txt(record.NWSHOP__Client_Session_Duration__c).up();
          }

          if(record.NWSHOP__Client_Counseling_Type__c) {
            profile.ele('tns:Client_Counseling_Type').txt(record.NWSHOP__Client_Counseling_Type__c).up();
          }
          if(record.NWSHOP__Client_Counseling_Termination__c) {
            profile.ele('tns:Client_Counseling_Termination').txt(record.NWSHOP__Client_Counseling_Termination__c).up();
          }
          if(record.NWSHOP__Client_Counseling_Fee__c !== null) {
            profile.ele('tns:Client_Counseling_Fee').txt(record.NWSHOP__Client_Counseling_Fee__c).up();
          }

          if(record.NWSHOP__Client_Attribute_HUD_Grant__c) {
            profile.ele('tns:Client_Attribute_HUD_Grant').txt(record.NWSHOP__Client_Attribute_HUD_Grant__c).up();
          }
          if(record.NWSHOP__Client_Grant_Amount_Used__c) {
            profile.ele('tns:Client_Grant_Amount_Used').txt(record.NWSHOP__Client_Grant_Amount_Used__c).up();
          }
          if(record.NWSHOP__Client_HECM_Certificate__c) {
            profile.ele('tns:Client_HECM_Certificate').txt(record.NWSHOP__Client_HECM_Certificate__c).up();
          }

          if(record.NWSHOP__Client_HECM_Certificate_Issue_Date__c) {
            var date_format = new Date(record.NWSHOP__Client_HECM_Certificate_Issue_Date__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_HECM_Certificate_Issue_Date').txt(formatted_date).up();
          }
          if(record.NWSHOP__Client_HECM_Certificate_Expiration_Date__c) {
            var date_format = new Date(record.NWSHOP__Client_HECM_Certificate_Expiration_Date__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_HECM_Certificate_Expiration_Date').txt(formatted_date).up();
          }

          if(record.NWSHOP__Client_HECM_Certificate_ID__c) {
            profile.ele('tns:Client_HECM_Certificate_ID').txt(record.NWSHOP__Client_HECM_Certificate_ID__c).up();
          }
          if(record.NWSHOP__Client_Predatory_Lending__c) {
            profile.ele('tns:Client_Predatory_Lending').txt(record.NWSHOP__Client_Predatory_Lending__c).up();
          }
          if(record.NWSHOP__Client_Mortgage_Type__c) {
            profile.ele('tns:Client_Mortgage_Type').txt(record.NWSHOP__Client_Mortgage_Type__c).up();
          }
          if(record.NWSHOP__Client_Mortgage_Type_After__c) {
            profile.ele('tns:Client_Mortgage_Type_After').txt(record.NWSHOP__Client_Mortgage_Type_After__c).up();
          }
          if(record.NWSHOP__Client_Finance_Type_Before__c) {
            profile.ele('tns:Client_Finance_Type_Before').txt(record.NWSHOP__Client_Finance_Type_Before__c).up();
          }

          if(record.NWSHOP__Client_Finance_Type_After__c) {
            profile.ele('tns:Client_Finance_Type_After').txt(record.NWSHOP__Client_Finance_Type_After__c).up();
          }
          if(record.NWSHOP__Client_FirstTime_Home_Buyer__c) {
            profile.ele('tns:Client_FirstTime_Home_Buyer').txt(record.NWSHOP__Client_FirstTime_Home_Buyer__c).up();
          }
          if(record.NWSHOP__Client_Discrimination_Victim__c) {
            profile.ele('tns:Client_Discrimination_Victim').txt(record.NWSHOP__Client_Discrimination_Victim__c).up();
          } else {
            profile.ele('tns:Client_Discrimination_Victim').txt('N').up();
          }
          if(record.NWSHOP__Client_Mortgage_Closing_Cost__c) {
            profile.ele('tns:Client_Mortgage_Closing_Cost').txt(record.NWSHOP__Client_Mortgage_Closing_Cost__c).up();
          }
          if(record.NWSHOP__Client_Mortgage_Interest_Rate__c) {
            profile.ele('tns:Client_Mortgage_Interest_Rate').txt(record.NWSHOP__Client_Mortgage_Interest_Rate__c).up();
          }
          if(record.NWSHOP__Client_Referred_By__c) {
            profile.ele('tns:Client_Referred_By').txt(record.NWSHOP__Client_Referred_By__c).up();
          }
          if(record.NWSHOP__Client_Sales_Contract_Signed__c) {
            var date_format = new Date(record.NWSHOP__Client_Sales_Contract_Signed__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_Sales_Contract_Signed').txt(formatted_date).up();
          }
          if(record.NWSHOP__Client_Credit_Score__c) {
            profile.ele('tns:Client_Credit_Score').txt(record.NWSHOP__Client_Credit_Score__c).up();
          }
          if(record.NWSHOP__Client_No_Credit_Score_Reason__c) {
            profile.ele('tns:Client_No_Credit_Score_Reason').txt(record.NWSHOP__Client_No_Credit_Score_Reason__c).up();
          }
          if(record.NWSHOP__Client_Credit_Score_Source__c) {
            profile.ele('tns:Client_Credit_Score_Source').txt(record.NWSHOP__Client_Credit_Score_Source__c).up();
          }
          if(record.NWSHOP__Client_Job_Duration__c !== null) {
            profile.ele('tns:Client_Job_Duration').txt(record.NWSHOP__Client_Job_Duration__c).up();
          }

          if(record.NWSHOP__Client_Household_Debt__c  !== null) {
            profile.ele('tns:Client_Household_Debt').txt(record.NWSHOP__Client_Household_Debt__c).up();
          }

          if(record.NWSHOP__Client_Mortgage_Deliquency__c) {
            profile.ele('tns:Client_Mortgage_Deliquency').txt(record.NWSHOP__Client_Mortgage_Deliquency__c).up();
          }
          if(record.NWSHOP__Client_Loan_Being_Reported__c) {
            profile.ele('tns:Client_Loan_Being_Reported').txt(record.NWSHOP__Client_Loan_Being_Reported__c).up();
          }
          if(record.NWSHOP__Client_Second_Loan_Exists__c) {
            profile.ele('tns:Client_Second_Loan_Exists').txt(record.NWSHOP__Client_Second_Loan_Exists__c).up();
          }
          if(record.NWSHOP__Client_Intake_Loan_Type__c) {
            profile.ele('tns:Client_Intake_Loan_Type').txt(record.NWSHOP__Client_Intake_Loan_Type__c).up();
          }
          if(record.NWSHOP__Client_Intake_Loan_Type_Is_Hybrid_ARM__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Hybrid_ARM').txt(record.NWSHOP__Client_Intake_Loan_Type_Is_Hybrid_ARM__c).up();
          }
          if(record.NWSHOP__Client_Intake_Loan_Type_Is_Option_ARM__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Option_ARM').txt(record.NWSHOP__Client_Intake_Loan_Type_Is_Option_ARM__c).up();
          }
          if(record.NWSHOP__Client_Intake_Loan_Type_Is_Interest_Only__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Interest_Only').txt(record.NWSHOP__Client_Intake_Loan_Type_Is_Interest_Only__c).up();
          }
          if(record.NWSHOP__Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_FHA_Or_VA_Insured').txt(record.NWSHOP__Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c).up();
          }
          if(record.NWSHOP__Loan_Type_Is_Privately_Held__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Privately_Held').txt(record.NWSHOP__Loan_Type_Is_Privately_Held__c).up();
          }
          if(record.NWSHOP__Loan_Type_Has_Interest_Rate_Reset__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Has_Interest_Rate_Reset').txt(record.NWSHOP__Loan_Type_Has_Interest_Rate_Reset__c).up();
          }
          if(record.NWSHOP__Client_Income_Level__c) {
            profile.ele('tns:Client_Income_Level').txt(record.NWSHOP__Client_Income_Level__c).up();
          }
          if(record.NWSHOP__Client_Purpose_Of_Visit__c) {
            profile.ele('tns:Client_Purpose_Of_Visit').txt(record.NWSHOP__Client_Purpose_Of_Visit__c).up();
          }
          if(record.NWSHOP__Client_Activity_Type__c) {
            profile.ele('tns:Client_Activity_Type').txt(record.NWSHOP__Client_Activity_Type__c).up();
          }
          if(record.NWSHOP__X9902ReportingQuarter__c) {
            profile.ele('tns:Client_9902_Reporting_Qtr').txt(record.NWSHOP__X9902ReportingQuarter__c).up();
          }

          if(record.NWSHOP__Client_Outcome__c) {
            const outcome = profile.ele('tns:Client_Outcomes')
            for(let s of record.NWSHOP__Client_Outcome__c.split(';')) {
              outcome.ele('tns:Client_Outcome').txt(s).up();
            }
          }
        }
        root.up();
        const xml = root.end({ prettyPrint: true });
        console.log(xml);


        const  strFileEncode = Buffer.from(xml).toString('base64');
        const soapXML = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.arm.hud.gov/">' +
          '<soapenv:Header></soapenv:Header><soapenv:Body><ser:postClientData><ser:submissionHeader6.0><ser:agcHcsId>' + settingVal.AgencyID__c +
          '</ser:agcHcsId><ser:agcName>' + settingVal.AgencyName__c + '</ser:agcName><ser:fiscalYearId>' + '28' + '</ser:fiscalYearId><ser:cmsVendorId>'+settingVal.VendorID__c+'</ser:cmsVendorId>' +
          '<ser:cmsPassword>'+settingVal.CMSPassword__c+'</ser:cmsPassword></ser:submissionHeader6.0>';
        const subXML1 = '<ser:submissionData>';
        const subXML2 = '</ser:submissionData>';
        const strEncodedSubxml = subXML1+strFileEncode+subXML2;
        const strsubEncode = '<ser:submissionDataEncoding>TEXT/XML</ser:submissionDataEncoding>';
        const strEnv = '</ser:postClientData></soapenv:Body></soapenv:Envelope>';

        const finalBody = soapXML+strsubEncode+strEncodedSubxml+strEnv;

        const config = {
          headers: {
            'Content-Type' : 'text/xml; charset=UTF-8',
            'Cache-Control' : 'no-cache',
            'Accept-Language': 'en-us',
            'Accept-Encoding': 'gzip, deflate, br',
            'Authorization' : authHeader
          }
        }

        console.log('### headers: ' + JSON.stringify(headers));
        console.log('### about to post')
        axios.post(settingVal.EndpointURL__c, finalBody, config).then(res => {
          console.log('### called axios');
          console.log('### got res: ', res.data);
          let submissionId = res.data.substring(res.data.indexOf('<submissionId>')+14, res.data.indexOf('</submissionId>'));
          console.log('### submission id: ' + submissionId);

          let statusXml ='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.arm.hud.gov/"><soapenv:Header></soapenv:Header>' +
            '<soapenv:Body><ser:getSubmissionInfo><ser:agcHcsId>'+settingVal.AgencyID__c+'</ser:agcHcsId><ser:submissionId>'+submissionId+'</ser:submissionId></ser:getSubmissionInfo></soapenv:Body></soapenv:Envelope>';

          let task = cron.schedule('* * * * *', () => {
            axios.post(settingVal.EndpointURL__c, statusXml, config).then(resStatus => {
              console.log('### submission id: ' + submissionId);
              console.log('### aaaaaa: ' + submissionId);
              // console.log(resStatus);

              let submissionStatus = resStatus.data.substring(resStatus.data.indexOf('<statusMessage>')+15,resStatus.data.indexOf('</statusMessage>'));

              console.log('### submissionStatus: ' + submissionStatus);
              if(submissionStatus == 'DONE') {
                conn.sobject("NWSHOP__X9902__c").update({
                  Id : request.query.q,
                  NWSHOP__ClientSubmissionStatus__c : submissionStatus
                }, function(err, ret) {
                  if (err || !ret.success) { return console.error(err, ret); }
                  console.log('Updated Successfully : ' + ret.id);
                  task.stop();
                });
              } else if(submissionStatus.indexOf('ERROR') != -1){
                console.log('### else submission status: ' + submissionStatus);
                console.log('### else submission status: ' + submissionStatus);
                conn.sobject("NWSHOP__X9902__c").update({
                  Id : request.query.q,
                  NWSHOP__ClientSubmissionStatus__c : resStatus.data
                }, function(err, ret) {
                  if (err || !ret.success) { return console.error(err, ret); }
                  console.log('Updated Successfully : ' + ret.id);
                  task.stop();
                });
              }

            });
          });

          conn.sobject("NWSHOP__X9902__c").update({
            Id : request.query.q,
            NWSHOP__ClientSubmissionID__c : submissionId
          }, function(err, ret) {
            if (err || !ret.success) { return console.error(err, ret); }
            console.log('Updated Successfully : ' + ret.id);
            response.json({ submissionId: submissionId, sentXml: xml });
          });
        }).catch(err => {
          console.log('### err axios: ' + err);

        });

      }
    });
  // });
});
















function doMoreQuery(conn, nextRecordsUrl) {
  return new Promise((resolve, reject) => {
    console.log('### doing more query: ' + nextRecordsUrl);
    conn.queryMore(nextRecordsUrl, (error, result) => {
      console.log('#### error');
      console.log(error);
      resolve(result);
    });
  });
}


function doQuery(query, conn) {
  return new Promise((resolve, reject) => {
    conn.query(query, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

const doQuerySummary = async (session, settingVal, query, recordId) => {
  const conn = resumeSalesforceConnection(session);

  const result = await doQuery(query, conn);
  let error;
  if (error) {
    console.error('Salesforce data API error: ' + JSON.stringify(error));
    return;
  } else {
    let authHeader = 'Basic ' + Buffer.from(settingVal.Username__c + ':' + settingVal.Password__c).toString('base64');
    console.log('### result finished');
    let lst9902 = result.records;
    let rptIdFlg = true;
    let root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('tns:SubmissionData', {
        'xsi:schemaLocation': 'http://gov.hud.arm/form_9902_databag_6_0 form_9902_databag_6_0.xsd',
        'xmlns:tns' : 'http://gov.hud.arm/form_9902_databag_6_0',
        'xmlns:xsi' : 'http://www.w3.org/2001/XMLSchema-instance'
      });

    let tagMap = {};
    tagMap['Report_Period_Id'] = 'NWSHOP__Report_Period_Id__c';
    tagMap['Ethnicity_Households_Counseling_Hispanic'] = 'NWSHOP__Hispanic__c';
    tagMap['Ethnicity_Households_Counseling_Non_Hispanic'] = 'NWSHOP__Non_Hispanic__c';
    tagMap['Ethnicity_Households_Counseling_No_Response'] = 'NWSHOP__No_Response__c';
    tagMap['Section_3_Total'] = 'NWSHOP__Section_3_Total__c';
    tagMap['Race_Households_Counseling_American_Indian'] = 'NWSHOP__American_Indian__c';
    tagMap['Race_Households_Counseling_Asian'] = 'NWSHOP__Asian__c';
    tagMap['Race_Households_Counseling_Black_African_American'] = 'NWSHOP__Black_African_American__c';
    tagMap['Race_Households_Counseling_American_Indian'] = 'NWSHOP__American_Indian__c';
    tagMap['Race_Households_Counseling_Pacific_Islanders'] = 'NWSHOP__Pacific_Islanders__c';
    tagMap['Race_Households_Counseling_White'] = 'NWSHOP__White__c';
    tagMap['Race_Households_Counseling_More_Than_One_Race'] = 'NWSHOP__More_Than_one_Race__c';
    tagMap['Race_Households_Counseling_No_Response'] = 'NWSHOP__MultiRace_No_Response__c';
    tagMap['Section_4_Total'] = 'NWSHOP__Section_4_Total__c';
    tagMap['Less30_AMI_Level'] = 'NWSHOP__Less30_AMI_Level__c';
    tagMap['a30_49_AMI_Level'] = 'NWSHOP__A30_49_AMI_Level__c';
    tagMap['a50_79_AMI_Level'] = 'NWSHOP__A50_79_AMI_Level__c';
    tagMap['a80_100_AMI_Level'] = 'NWSHOP__A80_100_AMI_Level__c';
    tagMap['Greater100_AMI_Level'] = 'NWSHOP__Greater100_AMI_Level__c';
    tagMap['AMI_No_Response'] = 'NWSHOP__AMI_No_Response__c';
    tagMap['Section_5_Total'] = 'NWSHOP__Section_5_Total__c';
    tagMap['Lives_In_Rural_Area'] = 'NWSHOP__Household_Lives_In_Rural_Area__c';
    tagMap['Does_Not_Live_In_Rural_Area'] = 'NWSHOP__Household_Does_Not_Live_In_Rural_Area__c';
    tagMap['Rural_Area_No_Response'] = 'NWSHOP__Rural_Area_No_Response__c';
    tagMap['Section_6_Total'] = 'NWSHOP__Section_6_Total__c';
    tagMap['Limited_English_Proficient'] = 'NWSHOP__Is_Limited_English_Proficient__c';
    tagMap['Not_Limited_English_Proficient'] = 'NWSHOP__Not_Limited_English_Proficient__c';
    tagMap['Limited_English_Proficient_No_Response'] = 'NWSHOP__Limited_English_Proficient_No_Response__c';
    tagMap['Section_7_Total'] = 'NWSHOP__Section_7_Total__c';
    tagMap['Education_Compl_Fin_Lit_Workshop'] = 'NWSHOP__Fin_Lit_Workshop__c';
    tagMap['Education_Compl_Pred_Lend_Workshop'] = 'NWSHOP__Pred_Lend_Workshop__c';
    tagMap['Education_Compl_Fair_Housing_Workshop'] = 'NWSHOP__Fair_Housing_Workshop__c';
    tagMap['Education_Compl_Homeless_Prev_Workshop'] = 'NWSHOP__Homeless_Prev_Workshop__c';
    tagMap['Education_Compl_Rental_Workshop'] = 'NWSHOP__Rental_Workshop__c';
    tagMap['Education_Compl_PrePurchase_HomeBuyer_Workshop'] = 'NWSHOP__PrePurchase_HomeBuyer_Workshop__c';
    tagMap['Education_Compl_NonDelinqency_PostPurchase_Workshop'] = 'NWSHOP__NonDelinqency_PostPurchase_Workshop__c';
    tagMap['Education_Compl_Resolv_Prevent_Mortg_Delinq_Workshop'] = 'NWSHOP__Resolv_Prevent_Mortg_Delinq_Workshop__c';
    tagMap['Education_Compl_Disaster_Prepare_Workshop'] = 'NWSHOP__Completed_Disaster_Preparedness_Workshop__c';
    tagMap['Education_Compl_Disaster_Recovery_Workshop'] = 'NWSHOP__Disaster_Recover_Workshop__c';
    tagMap['Section_8_Total'] = 'NWSHOP__Section_8_Total__c';
    tagMap['One_Homeless_Assistance_Counseling'] = 'NWSHOP__Homeless_Assistance_Counseling__c';
    tagMap['One_Rental_Topics_Counseling'] = 'NWSHOP__Rental_Topics_Counseling__c';
    tagMap['One_PrePurchase_HomeBuying_Counseling'] = 'NWSHOP__PrePurchase_HomeBuying_Counseling__c';
    tagMap['One_Non_Delinq_Post_Purchase_Counseling'] = 'NWSHOP__Fin_Management_Counseling__c';
    tagMap['One_Reverse_Mortgage_Counseling'] = 'NWSHOP__Reverse_Mortgage_Counseling__c';
    tagMap['One_Resolv_Prevent_Fwd_Mortg_Delinq_Counseling'] = 'NWSHOP__Forward_Mortgage_Delinquency_or_Default__c';
    tagMap['One_Resolv_Prevent_Rev_Mortg_Delinq_Counseling'] = 'NWSHOP__Reverse_Mortgage_Delinquency_or_Default__c';
    tagMap['One_Disaster_Preparedness_Assistance_Counseling'] = 'NWSHOP__Disaster_Preparedness_Assistance__c';
    tagMap['One_Disaster_Recovery_Assistance_Counseling'] = 'NWSHOP__Disaster_Recovery_Assistance__c';
    tagMap['Section_9_Total'] = 'NWSHOP__Section_9_Total__c';
    tagMap['Outcome_One_On_One_And_Education'] = 'NWSHOP__One_On_One_And_Group__c';
    tagMap['Outcome_Received_Info_Fair_Housing'] = 'NWSHOP__Received_Info_Fair_Housing__c';
    tagMap['Outcome_Developed_Budget'] = 'NWSHOP__Developed_Sustainable_Budget__c';
    tagMap['Outcome_Improved_Financial_Capacity'] = 'NWSHOP__Improved_Financial_Capacity__c';
    tagMap['Outcome_Gained_Access_Resources_Improve_Housing'] = 'NWSHOP__Gained_Access_Resources_Improve_Housing__c';
    tagMap['Outcome_Gained_Access_NonHousing_Resources'] = 'NWSHOP__Gained_Access_NonHousing_Resources__c';
    tagMap['Outcome_Homeless_Obtained_Housing'] = 'NWSHOP__Homeless_Obtained_Housing__c';
    tagMap['Outcome_Gained_Access_Disaster_Recovery_NonHousing_Resources'] = 'NWSHOP__Disaster_Recovery_Non_housing_Resources__c';
    tagMap['Outcome_Obtained_Disaster_Recovery_Housing_Resources'] = 'NWSHOP__Disaster_Recovery_Housing_Resources__c';
    tagMap['Outcome_Developed_Emergency_Preparedness_Plan'] = 'NWSHOP__Emergency_Preparedness_Plan__c';
    tagMap['Outcome_Received_Rental_Counseling_Avoided_Eviction'] = 'NWSHOP__Rec_Rental_Counseling_Avoided_Eviction__c';
    tagMap['Outcome_Received_Rental_Counseling_Improved_Living_Conditions'] = 'NWSHOP__Rec_Rental_Counseling_Living_Conditions__c';
    tagMap['Outcome_Received_PrePurchase_Counseling_Purchased_Housing'] = 'NWSHOP__PrePurchase_Counseling_Purchased_Housing__c';
    tagMap['Outcome_Received_Reverse_Mortgage_Counseling_Obtained_HECM'] = 'NWSHOP__Mortgage_Counseling_Obtained_HECM__c';
    tagMap['Outcome_Received_NonDelinquency_PostPurchase_Counseling_Improve_Conditions_Affordability'] = 'NWSHOP__NonDel_PostPur_Coun_Imp_Cond_Afford__c';
    tagMap['Outcome_Prevented_Resolved_Forward_Mortgage_Default'] = 'NWSHOP__Prevented_Forward_Mortgage_Default__c';
    tagMap['Outcome_Prevented_Resolved_Reverse_Mortgage_Default'] = 'NWSHOP__Prevented_Reverse_Mortgage_Default__c';
    tagMap['Outcome_Received_Forward_Mortgage_Modification_Remain_Current_In_Modified_Mortgage'] = 'NWSHOP__Forward_Mortgage_Mod_Improved_Financials__c';
    tagMap['Outcome_Received_Forward_Mortgage_Modification_Improved_Financial_Capacity'] = 'NWSHOP__Forward_Mod_Improved_Financial_Capacity__c';
    tagMap['Section_10_Total'] = 'NWSHOP__Section_10_Total__c';

    const top_data_node = root.ele('tns:Form_9902');
    for(const [key, value] of Object.entries(tagMap)) {
      for (let objAp of lst9902) {
        let actType = objAp.NWSHOP__Activity_type_id__c.toString();
        if (rptIdFlg == true && key == 'Report_Period_Id') {
          top_data_node.ele('tns:' + key).txt(objAp[tagMap[key]]).up();
          rptIdFlg = false
        } else if (key != 'Report_Period_Id') {
          if(!objAp[tagMap[key]]) {
            top_data_node.ele('tns:' + key, {activity_type_id: actType}).txt(0);
          } else {
            top_data_node.ele('tns:' + key, {activity_type_id: actType}).txt(objAp[tagMap[key]]);
          }

        }
      }
    }

    root.up();
    let gstagMap = {};
    let gsatagMap = {};
    let atagMap = {};
    gstagMap['Group_Session_Id'] = 'NWSHOP__Group_Session_Id__c';
    gstagMap['Group_Session_Counselor_Id'] = 'NWSHOP__Group_Session_Counselor_Id__c';
    gstagMap['Group_Session_Counselor_HUD_Id'] = 'NWSHOP__Group_Session_Counselor_HUD_Id__c';
    gstagMap['Group_Session_Title'] = 'NWSHOP__Group_Session_Title__c';
    gstagMap['Group_Session_Date'] = 'NWSHOP__Group_Session_Date__c';
    gstagMap['Group_Session_Duration'] = 'NWSHOP__Group_Session_Duration__c';
    gstagMap['Group_Session_Type'] = 'NWSHOP__Group_Session_Type__c';
    gstagMap['Group_Session_Attribute_HUD_Grant'] = 'NWSHOP__Group_Session_Attribute_HUD_Grant__c';
    gstagMap['Group_Session_Activity_Type'] = 'NWSHOP__Group_Session_Activity_Type__c';
    gsatagMap['Attendee_Id'] = 'NWSHOP__Group_Session_Attendee_Id__c';
    gsatagMap['Attendee_Fee_Amount'] = 'NWSHOP__Attendee_Fee_Amount__c';
    gsatagMap['Attendee_Referred_By'] = 'NWSHOP__Attendee_Referred_By__c';
    gsatagMap['Attendee_FirstTime_Home_Buyer'] = 'NWSHOP__Attendee_FirstTime_Home_Buyer__c';
    gsatagMap['Attendee_Income_Level'] = 'NWSHOP__Group_Session_Attendee_Income_Level__c';
    gsatagMap['Attendee_City'] = 'NWSHOP__Group_Session_Attendee_City__c';
    gsatagMap['Attendee_State'] = 'NWSHOP__Group_Session_Attendee_State__c';
    gsatagMap['Attendee_Zip_Code'] = 'NWSHOP__Group_Session_Attendee_Zip_Code__c';
    gsatagMap['Attendee_Rural_Area'] = 'NWSHOP__Group_Session_Attendee_Rural_Area_Status__c';
    gsatagMap['Attendee_Limited_English_Proficiency'] = 'NWSHOP__Grp_Attendee_Limited_English_Proficiency__c';
    atagMap['Attendee_Id'] = 'NWSHOP__Attendee_ID__c';
    atagMap['Attendee_Income_Level'] = 'NWSHOP__Attendee_Income_Level__c';
    atagMap['Attendee_City'] = 'NWSHOP__Attendee_City__c';
    atagMap['Attendee_State'] = 'NWSHOP__Attendee_State__c';
    atagMap['Attendee_Zip_Code'] = 'NWSHOP__Attendee_Zip_Code__c';
    atagMap['Attendee_Rural_Area'] = 'NWSHOP__Attendee_Rural_Area__c';
    atagMap['Attendee_Limited_English_Proficiency'] = 'NWSHOP__Attendee_Limited_English_Proficiency__c';
    atagMap['Attendee_Race_ID'] = 'NWSHOP__Attendee_Race_ID__c';
    atagMap['Attendee_Ethnicity_ID'] = 'NWSHOP__Attendee_Ethnicity_ID__c';

    let gsalst9902 = [];
    let gslst9902 = [];
    let alst9902 = [];
    let GSMap = {};
    const groupSessionQuery = 'select Id,NWSHOP__Group_Session_Id__c,NWSHOP__Group_Session_Counselor_Id__c,NWSHOP__Group_Session_Counselor_HUD_Id__c,NWSHOP__Group_Session_Title__c,NWSHOP__Group_Session_Date__c,\n' +
      '  NWSHOP__Group_Session_Duration__c,NWSHOP__Group_Session_Type__c,NWSHOP__Group_Session_Attribute_HUD_Grant__c,NWSHOP__Group_Session_Activity_Type__c\n' +
      '  from NWSHOP__X9902Summary__c where NWSHOP__X9902__c = \'' + recordId + '\'  AND NWSHOP__Element_Type__c = \'Group Session\' AND NWSHOP__Group_Session_Id__c != NULL';
    const groupSessionAttendeeQuery = 'select Id,NWSHOP__Group_Session_Id__c,NWSHOP__Group_Session_Attendee_ID__c,NWSHOP__Attendee_Fee_Amount__c,NWSHOP__Attendee_Referred_By__c,NWSHOP__Attendee_FirstTime_Home_Buyer__c,NWSHOP__Group_Session_Attendee_Income_Level__c,\n' +
      '  NWSHOP__Group_Session_Attendee_Address_1__c, NWSHOP__Group_Session_Attendee_Address_2__c, NWSHOP__Group_Session_Attendee_City__c, NWSHOP__Group_Session_Attendee_State__c,NWSHOP__Group_Session_Attendee_Zip_Code__c,\n' +
      '  NWSHOP__Group_Session_Attendee_Rural_Area_Status__c, NWSHOP__Grp_Attendee_Limited_English_Proficiency__c\n' +
      '  from NWSHOP__X9902Summary__c where NWSHOP__X9902__c = \'' + recordId + '\' AND NWSHOP__Element_Type__c = \'Group Session Attendee\' AND NWSHOP__Group_Session_Id__c != NULL';
    const attendeeQuery = 'select Id, NWSHOP__Attendee_ID__c, NWSHOP__Attendee_Fname__c, NWSHOP__Attendee_Lname__c, NWSHOP__Attendee_Mname__c, NWSHOP__Attendee_Income_Level__c, NWSHOP__Attendee_Address_1__c, NWSHOP__Attendee_Address_2__c,\n' +
      '  NWSHOP__Attendee_City__c, NWSHOP__Attendee_State__c, NWSHOP__Attendee_Zip_Code__c, NWSHOP__Attendee_Rural_Area__c, NWSHOP__Attendee_Limited_English_Proficiency__c, NWSHOP__Attendee_Race_ID__c, NWSHOP__Attendee_Ethnicity_ID__c\n' +
      '  from NWSHOP__X9902Summary__c where NWSHOP__X9902__c = \'' + recordId + '\' AND NWSHOP__Element_Type__c = \'Attendee\'';


    const resultGroup = await doQuery(groupSessionQuery, conn);
    gslst9902 = resultGroup.records;
    console.log('### groupSessionQuery: ' + groupSessionQuery);
    console.log('### resultGroup: ' + JSON.stringify(resultGroup.nextRecordsUrl));
    if(resultGroup.nextRecordsUrl) {
      let isDone = false;
      let curNextUrl = resultGroup.nextRecordsUrl;
      while(!isDone) {
        const moreResults = await doMoreQuery(conn, curNextUrl);

        console.log('### moreResults: ' + JSON.stringify(moreResults.nextRecordsUrl));
        if(moreResults && moreResults.records) {
          gslst9902 = [...gslst9902, ...moreResults.records];
        }

        if(moreResults && moreResults.nextRecordsUrl) {
          curNextUrl = moreResults.nextRecordsUrl;
        } else {
          isDone = true;
        }
      }
    }
    console.log('### gslst9902 size: ' + gslst9902.length);

    const resultSessionAttendee = await doQuery(groupSessionAttendeeQuery, conn);
    gsalst9902 = resultSessionAttendee.records;

    if(resultSessionAttendee.nextRecordsUrl) {
      let isDone = false;
      let curNextUrl = resultSessionAttendee.nextRecordsUrl;
      while(!isDone) {
        const moreResults = await doMoreQuery(conn, curNextUrl);

        console.log('### moreResults: ' + JSON.stringify(moreResults.nextRecordsUrl));
        if(moreResults && moreResults.records) {
          gsalst9902 = [...gsalst9902, ...moreResults.records];
        }

        if(moreResults && moreResults.nextRecordsUrl) {
          curNextUrl = moreResults.nextRecordsUrl;
        } else {
          isDone = true;
        }
      }
    }
    console.log('### gsalst9902: ' + gsalst9902.length);

    const resultAttendee = await doQuery(attendeeQuery, conn);
    alst9902 = resultAttendee.records;

    if(resultAttendee.nextRecordsUrl) {
      let isDone = false;
      let curNextUrl = resultAttendee.nextRecordsUrl;
      while(!isDone) {
        const moreResults = await doMoreQuery(conn, curNextUrl);

        console.log('### moreResults: ' + JSON.stringify(moreResults.nextRecordsUrl));
        if(moreResults && moreResults.records) {
          alst9902 = [...alst9902, ...moreResults.records];
        }

        if(moreResults && moreResults.nextRecordsUrl) {
          curNextUrl = moreResults.nextRecordsUrl;
        } else {
          isDone = true;
        }
      }
    }
    console.log('### alst9902: ' + alst9902.length);

    for(let gs of gslst9902){
      GSMap[gs.Group_Session_Id__c] = gs;
    }
    const group_sessions = root.ele('tns:Group_Sessions');
    for(const [sumKey, value] of Object.entries(GSMap)) {
      let objAP1 = GSMap[sumKey];
      const profile = group_sessions.ele('tns:Group_Session');

      for(const [key, value] of Object.entries(gstagMap)) {

        if(objAP1[gstagMap[key]]) {
          if (key == 'Group_Session_Date') {
            var date_format = new Date(objAP1[gstagMap[key]]);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();

            profile.ele('tns:' + key).txt(formatted_date).up();
          } else {
            profile.ele('tns:' + key).txt(objAP1[gstagMap[key]].toString()).up();
          }
        }
      }

      const sessionAttendees = profile.ele('tns:Group_Session_Attendees');
      for(let objAP2 of gsalst9902){
        if(objAP2.Group_Session_Id__c == objAP1.Group_Session_Id__c){


          const sessionAttendee = sessionAttendees.ele('tns:Group_Session_Attendee');
          for(const [key, value] of Object.entries(gsatagMap)){
            if(objAP2[gsatagMap[key]]) {
              sessionAttendee.ele('tns:' + key).txt(objAP2[gsatagMap[key]]).up();
            } else if(key == 'Attendee_Fee_Amount') {
              sessionAttendee.ele('tns:' + key).txt('0').up();
            } else if(key == 'Attendee_Fee_Amount') {
              sessionAttendee.ele('tns:' + key).txt('0').up();
            }
          }
        }
      }
    }


    const attendees = root.ele('tns:Attendees');
    for(let objAp of alst9902) {
      const attendee = attendees.ele('tns:Attendee');
      for (const [key, value] of Object.entries(atagMap)) {
        if(objAp[atagMap[key]]) {
          attendee.ele('tns:' + key).txt(objAp[atagMap[key]]).up();
        }
      }

    }

    root.up();
    const xml = root.end({ prettyPrint: true });

    const  strFileEncode = Buffer.from(xml).toString('base64');
    const soapXML = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.arm.hud.gov/">' +
      '<soapenv:Header></soapenv:Header><soapenv:Body><ser:postForm9902Data><ser:submissionHeader6.0><ser:agcHcsId>' + settingVal.AgencyID__c +
      '</ser:agcHcsId><ser:agcName>' + settingVal.AgencyName__c + '</ser:agcName><ser:fiscalYearId>' + '28' + '</ser:fiscalYearId><ser:cmsVendorId>'+settingVal.VendorID__c+'</ser:cmsVendorId>' +
      '<ser:cmsPassword>'+settingVal.CMSPassword__c+'</ser:cmsPassword></ser:submissionHeader6.0>';
    const subXML1 = '<ser:submissionData>';
    const subXML2 = '</ser:submissionData>';
    const strEncodedSubxml = subXML1+strFileEncode+subXML2;
    const strsubEncode = '<ser:submissionDataEncoding>TEXT/XML</ser:submissionDataEncoding>';
    const strEnv = '</ser:postForm9902Data></soapenv:Body></soapenv:Envelope>';

    const finalBody = soapXML+strsubEncode+strEncodedSubxml+strEnv;

    const config = {
      headers: {
        'Content-Type' : 'text/xml; charset=UTF-8',
        'Cache-Control' : 'no-cache',
        'Accept-Language': 'en-us',
        'Accept-Encoding': 'gzip, deflate, br',
        'Authorization' : authHeader
      }
    }

    axios.post(settingVal.EndpointURL__c, finalBody, config).then(res => {
      let submissionId = res.data.substring(res.data.indexOf('<submissionId>')+14, res.data.indexOf('</submissionId>'));

      console.log('### submissionId: ' + submissionId);
      let statusXml ='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.arm.hud.gov/"><soapenv:Header></soapenv:Header>' +
        '<soapenv:Body><ser:getSubmissionInfo><ser:agcHcsId>'+settingVal.AgencyID__c+'</ser:agcHcsId><ser:submissionId>'+submissionId+'</ser:submissionId></ser:getSubmissionInfo></soapenv:Body></soapenv:Envelope>';

      let task = cron.schedule('* * * * *', () => {
        console.log('### running cron');
        axios.post(settingVal.EndpointURL__c, statusXml, config).then(resStatus => {
          let submissionStatus = resStatus.data.substring(resStatus.data.indexOf('<statusMessage>')+15,resStatus.data.indexOf('</statusMessage>'));
          console.log('### submissionStatus: ' + submissionStatus);

          if(submissionStatus == 'DONE') {

            conn.sobject("NWSHOP__X9902__c").update({
              Id : recordId,
              NWSHOP__Summary9902SubmissionStatus__c : submissionStatus
            }, function(err, ret) {
              if (err || !ret.success) { return console.error(err, ret); }
              console.log('Updated Successfully : ' + ret.id);
              task.stop();
            });
          } else if(submissionStatus.indexOf('ERROR') != -1){

            conn.sobject("NWSHOP__X9902__c").update({
              Id : recordId,
              NWSHOP__Summary9902SubmissionStatus__c : resStatus.data
            }, function(err, ret) {
              if (err || !ret.success) { return console.error(err, ret); }
              console.log('Updated Successfully : ' + ret.id);
              task.stop();
            });
          }

        });
      });


      conn.sobject("NWSHOP__X9902__c").update({
        Id : recordId,
        NWSHOP__Summary9902SubmissionID__c : submissionId,
      }, function(err, ret) {
        if (err || !ret.success) { return console.error(err, ret); }
        console.log('### Updated Successfully : ' + ret.id);
      });




    }).catch(err => {
      console.log('### err axios: ' + err);
    });
  }
}

app.get('/query-summary', async (request, response) => {
  console.log('### query summary');
  const session = getSession(request, response);
  if (session == null) {
    return;
  }

  const query = 'select Id,NWSHOP__Section_3_Total__c, NWSHOP__Report_Period_Id__c, NWSHOP__Activity_type_id__c, NWSHOP__Hispanic__c, NWSHOP__Non_Hispanic__c, NWSHOP__No_Response__c, NWSHOP__American_Indian__c, NWSHOP__Asian__c, NWSHOP__Black_African_American__c, NWSHOP__Pacific_Islanders__c, \n' +
    '    NWSHOP__White__c, NWSHOP__AMINDWHT__c, NWSHOP__ASIANWHT__c, NWSHOP__BLKWHT__c, NWSHOP__AMRCINDBLK__c, NWSHOP__OtherMLTRC__c, NWSHOP__MultiRace_No_Response__c, NWSHOP__Section_4_Total__c, NWSHOP__Less30_AMI_Level__c, NWSHOP__A50_79_AMI_Level__c, NWSHOP__A30_49_AMI_Level__c, NWSHOP__A80_100_AMI_Level__c, \n' +
    '    NWSHOP__Greater100_AMI_Level__c, NWSHOP__AMI_No_Response__c, NWSHOP__Section_5_Total__c, NWSHOP__Household_Lives_In_Rural_Area__c, NWSHOP__Household_Does_Not_Live_In_Rural_Area__c, NWSHOP__Rural_Area_No_Response__c, NWSHOP__Not_Limited_English_Proficient__c, \n' +
    '    NWSHOP__Is_Limited_English_Proficient__c, NWSHOP__Section_6_Total__c, NWSHOP__Limited_English_Proficient_No_Response__c, NWSHOP__Section_7_Total__c, NWSHOP__Fair_Housing_Workshop__c, NWSHOP__Fin_Lit_Workshop__c, NWSHOP__Other_Workshop__c, NWSHOP__Pred_Lend_Workshop__c, \n' +
    '    NWSHOP__Rental_Workshop__c, NWSHOP__Homeless_Prev_Workshop__c, NWSHOP__Resolv_Prevent_Mortg_Delinq_Workshop__c, NWSHOP__NonDelinqency_PostPurchase_Workshop__c, NWSHOP__PrePurchase_HomeBuyer_Workshop__c, NWSHOP__Section_8_Total__c, NWSHOP__Homeless_Assistance_Counseling__c, \n' +
    '    NWSHOP__Rental_Topics_Counseling__c, NWSHOP__PrePurchase_HomeBuying_Counseling__c, NWSHOP__Fin_Management_Counseling__c, NWSHOP__Reverse_Mortgage_Counseling__c, NWSHOP__Resolv_Prevent_Mortg_Delinq_Counseling__c, NWSHOP__Section_9_Total__c, NWSHOP__One_On_One_And_Group__c, \n' +
    '    NWSHOP__Received_Info_Fair_Housing__c, NWSHOP__Developed_Sustainable_Budget__c, NWSHOP__Improved_Financial_Capacity__c, NWSHOP__Gained_Access_Resources_Improve_Housing__c, NWSHOP__Gained_Access_NonHousing_Resources__c, NWSHOP__Homeless_Obtained_Housing__c, \n' +
    '    NWSHOP__Rec_Rental_Counseling_Avoided_Eviction__c, NWSHOP__Rec_Rental_Counseling_Living_Conditions__c, NWSHOP__PrePurchase_Counseling_Purchased_Housing__c, NWSHOP__Mortgage_Counseling_Obtained_HECM__c, NWSHOP__NonDel_PostPur_Coun_Imp_Cond_Afford__c, \n' +
    '    NWSHOP__Prevented_Resolved_Mortgage_Default__c, NWSHOP__Section_10_Total__c, NWSHOP__Completed_Disaster_Preparedness_Workshop__c, NWSHOP__Disaster_Recover_Workshop__c, NWSHOP__More_Than_one_Race__c, NWSHOP__Forward_Mortgage_Delinquency_or_Default__c, \n' +
    '    NWSHOP__Reverse_Mortgage_Delinquency_or_Default__c, NWSHOP__Disaster_Recovery_Assistance__c, NWSHOP__Disaster_Preparedness_Assistance__c, NWSHOP__Disaster_Recovery_Non_housing_Resources__c, NWSHOP__Disaster_Recovery_Housing_Resources__c, \n' +
    '    NWSHOP__Emergency_Preparedness_Plan__c, NWSHOP__Prevented_Forward_Mortgage_Default__c, NWSHOP__Prevented_Reverse_Mortgage_Default__c, NWSHOP__Forward_Mortgage_Mod_Improved_Financials__c, NWSHOP__Forward_Mod_Improved_Financial_Capacity__c\n' +
    '    from NWSHOP__X9902Summary__c where NWSHOP__X9902__c = \'' + request.query.q + '\' AND NWSHOP__Element_Type__c = \'9902\' ';

  if (!query) {
    response.status(400).send('Missing query parameter.');
    return;
  }
  const settingVal = {
    Username__c: request.query.username,                                        // SEND PARAMS
    Password__c: request.query.password,                                      // SEND PARAMS
    EndpointURL__c: 'https://arm.hud.gov:9001/ARM/ARM',
    AgencyName__c: 'NWCompass',
    CMSPassword__c: 'M!Utzn6T',
    VendorID__c: '93',
    AgencyID__c: request.query.agencyid,     // grab from call
  };

  doQuerySummary(session, settingVal, query, request.query.q);

  response.status(200).send('Processing now, this will take a moment. Please check salesforce.');
});


app.listen(app.get('port'), () => {
  console.log('### running on port: ' + app.get('port'));
});
