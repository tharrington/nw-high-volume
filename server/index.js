// 3rd party dependencies
const path = require('path'),
  express = require('express'),
  session = require('express-session'),
  jsforce = require('jsforce');
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
  response.redirect(oauth2.getAuthorizationUrl({ scope: 'full' }));
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

  const query = 'select Id,Client_ID_Num__c,Client_Case_Num__c,Client_SSN1__c,Client_SSN2__c,Client_First_Name__c,Client_Last_Name__c,Client_Middle_Name__c,\n' +
    '                   Client_Street_Address_1__c,Client_Street_Address_2__c,Client_State__c,Client_Zip__c,Client_New_Street_Address_1__c,Client_New_Street_Address_2__c,\n' +
    '                   Client_New_City__c,Client_New_State__c,Client_New_Zip__c,Client_Phone_Num__c,Client_Mobile_Phone_Num__c,Client_Fax__c,Client_Email__c,Client_Family_Size__c,\n' +
    '                   Client_Gender__c,Client_Marital_Status__c,Client_Race_ID__c,Client_Ethnicity_ID__c,Client_Household_Gross_Monthly_Income__c,Client_Head_Of_Household_Type__c,\n' +
    '                   Client_Birth_DT__c,Client_Counselor_ID__c,Client_Counselor_HUD_Id__c,Client_Highest_Educ_Grade__c,Client_Farm_Worker__c,Client_Rural_Area__c,Client_Limited_English_Proficiency__c,\n' +
    '                   Client_Colonias_Resident__c,Client_HUD_Assistance__c,Client_Disabled__c,Client_Dependents_Num__c,Client_Intake_DT__c,Client_Counsel_Start_Session_DateTime__c,Client_Counsel_End_Session_DateTime__c,\n' +
    '                   Client_Language_Spoken__c,Client_Session_Duration__c,Client_Counseling_Type__c,Client_Counseling_Termination__c,Client_Counseling_Fee__c,Client_Attribute_HUD_Grant__c,Client_Grant_Amount_Used__c,\n' +
    '                   Client_HECM_Certificate__c,Client_HECM_Certificate_Issue_Date__c,Client_HECM_Certificate_Expiration_Date__c,Client_HECM_Certificate_ID__c,Client_Predatory_Lending__c,Client_Mortgage_Type__c,\n' +
    '                   Client_Mortgage_Type_After__c,Client_Finance_Type_Before__c,Client_Finance_Type_After__c,Client_FirstTime_Home_Buyer__c,Client_Discrimination_Victim__c,Client_Mortgage_Closing_Cost__c,\n' +
    '                   Client_Mortgage_Interest_Rate__c,Client_Referred_By__c,Client_Sales_Contract_Signed__c,Client_Credit_Score__c,Client_No_Credit_Score_Reason__c,Client_Credit_Score_Source__c,Client_Job_Duration__c,\n' +
    '                   Client_Household_Debt__c,Client_Mortgage_Deliquency__c,Client_Spouse_First_Name__c,Client_Spouse_Last_Name__c,Client_Spouse_Middle_Name__c,Client_Spouse_SSN__c,Client_Loan_Being_Reported__c,\n' +
    '                   Client_Second_Loan_Exists__c,Client_Intake_Loan_Type__c,Client_Intake_Loan_Type_Is_Hybrid_ARM__c,Client_Intake_Loan_Type_Is_Option_ARM__c,Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c,\n' +
    '                   Loan_Type_Is_Privately_Held__c,Client_Intake_Loan_Type_Is_Interest_Only__c,Client_Income_Level__c,Client_Purpose_Of_Visit__c,Client_Activity_Type__c,Client_City__c,\n' +
    '                   Loan_Type_Has_Interest_Rate_Reset__c,Client_Outcome__c,X9902ReportingQuarter__c from X9902_Client__c where X9902__c = \'' + request.query.q +'\'';
  console.log('### query: ' + query);
  if (!query) {
    response.status(400).send('Missing query parameter.');
    return;
  }
  const conn = resumeSalesforceConnection(session);

  conn.query('SELECT Name, EndpointURL__c, AgencyId__c, AgencyName__c, Username__c, Password__c, CMSPassword__c, VendorId__c FROM IntegrationSettings__c WHERE Name = \'HUD Settings\'', (error, customSetting) => {
    conn.query(query, (error, result) => {
      if (error) {
        console.error('Salesforce data API error: ' + JSON.stringify(error));
        response.status(500).json(error);
        return;
      } else {
        console.log('### customSetting: ' + JSON.stringify(customSetting));
        const settingVal = customSetting.records[0];
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
          if(record.Client_ID_Num__c) {
            profile.ele('tns:Client_ID_Num').txt(record.Client_ID_Num__c).up();
          }
          if(record.Client_Case_Num__c) {
            profile.ele('tns:Client_Case_Num').txt(record.Client_Case_Num__c).up();
          }
          if(record.Client_City__c) {
            profile.ele('tns:Client_City').txt(record.Client_City__c).up();
          }
          if(record.Client_State__c) {
            profile.ele('tns:Client_State').txt(record.Client_State__c).up();
          }
          if(record.Client_Zip__c) {
            profile.ele('tns:Client_Zip').txt(record.Client_Zip__c).up();
          }
          if(record.Client_New_City__c) {
            profile.ele('tns:Client_New_City').txt(record.Client_New_City__c).up();
          }
          if(record.Client_New_State__c) {
            profile.ele('tns:Client_New_State').txt(record.Client_New_State__c).up();
          }
          if(record.Client_New_Zip__c) {
            profile.ele('tns:Client_New_Zip').txt(record.Client_New_Zip__c).up();
          }

          if(record.Client_Family_Size__c) {
            profile.ele('tns:Client_Family_Size').txt(record.Client_Family_Size__c).up();
          }
          if(record.Client_Gender__c) {
            profile.ele('tns:Client_Gender').txt(record.Client_Gender__c).up();
          }
          if(record.Client_Marital_Status__c) {
            profile.ele('tns:Client_Marital_Status').txt(record.Client_Marital_Status__c).up();
          }
          if(record.Client_Race_ID__c) {
            profile.ele('tns:Client_Race_ID').txt(record.Client_Race_ID__c).up();
          }
          if(record.Client_Ethnicity_ID__c) {
            profile.ele('tns:Client_Ethnicity_ID').txt(record.Client_Ethnicity_ID__c).up();
          }

          if(record.Client_Household_Gross_Monthly_Income__c) {
            profile.ele('tns:Client_Household_Gross_Monthly_Income').txt(record.Client_Household_Gross_Monthly_Income__c).up();
          }
          if(record.Client_Head_Of_Household_Type__c) {
            profile.ele('tns:Client_Head_Of_Household_Type').txt(record.Client_Head_Of_Household_Type__c).up();
          }
          if(record.Client_Counselor_ID__c) {
            profile.ele('tns:Client_Counselor_ID').txt(record.Client_Counselor_ID__c).up();
          }
          if(record.Client_Counselor_HUD_Id__c) {
            profile.ele('tns:Client_Counselor_HUD_Id').txt(record.Client_Counselor_HUD_Id__c).up();
          }
          if(record.Client_Highest_Educ_Grade__c) {
            profile.ele('tns:Client_Highest_Educ_Grade').txt(record.Client_Highest_Educ_Grade__c).up();
          }
          if(record.Client_Farm_Worker__c) {
            profile.ele('tns:Client_Farm_Worker').txt(record.Client_Farm_Worker__c).up();
          }
          if(record.Client_Rural_Area__c) {
            profile.ele('tns:Client_Rural_Area').txt(record.Client_Rural_Area__c).up();
          }
          if(record.Client_Limited_English_Proficiency__c) {
            profile.ele('tns:Client_Limited_English_Proficiency').txt(record.Client_Limited_English_Proficiency__c).up();
          }

          if(record.Client_Colonias_Resident__c) {
            profile.ele('tns:Client_Colonias_Resident').txt(record.Client_Colonias_Resident__c).up();
          }
          if(record.Client_HUD_Assistance__c) {
            profile.ele('tns:Client_HUD_Assistance').txt(record.Client_HUD_Assistance__c).up();
          }
          if(record.Client_Disabled__c) {
            profile.ele('tns:Client_Disabled').txt(record.Client_Disabled__c).up();
          }
          if(record.Client_Dependents_Num__c !== null) {
            profile.ele('tns:Client_Dependents_Num').txt(record.Client_Dependents_Num__c).up();
          }

          /* DATE TIME MAY BE AN ISSUE!!!! */
          if(record.Client_Intake_DT__c) {
            //w.writeCharacters(String.valueOf(DateTime.newInstance(d5.year(),d5.month(),d5.day()).format('MM-dd-yyyy')));
            var date_format = new Date(record.Client_Intake_DT__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_Intake_DT').txt(formatted_date).up();
          }
          if(record.Client_Counsel_Start_Session_DateTime__c) {
            //w.writeCharacters(String.valueOf(d.format('MM-dd-yyyy hh:mm')));
            var date_format = new Date(record.Client_Counsel_Start_Session_DateTime__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear() + ' 12:00';
            profile.ele('tns:Client_Counsel_Start_Session_DateTime').txt(formatted_date).up();
          }
          if(record.Client_Counsel_End_Session_DateTime__c) {
            //w.writeCharacters(String.valueOf(d.format('MM-dd-yyyy hh:mm')));
            var date_format = new Date(record.Client_Counsel_End_Session_DateTime__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear() + ' 12:00';

            profile.ele('tns:Client_Counsel_End_Session_DateTime').txt(formatted_date).up();
          }

          if(record.Client_Language_Spoken__c) {
            profile.ele('tns:Client_Language_Spoken').txt(record.Client_Language_Spoken__c).up();
          }
          if(record.Client_Session_Duration__c !== null) {
            profile.ele('tns:Client_Session_Duration').txt(record.Client_Session_Duration__c).up();
          }

          if(record.Client_Counseling_Type__c) {
            profile.ele('tns:Client_Counseling_Type').txt(record.Client_Counseling_Type__c).up();
          }
          if(record.Client_Counseling_Termination__c) {
            profile.ele('tns:Client_Counseling_Termination').txt(record.Client_Counseling_Termination__c).up();
          }
          if(record.Client_Counseling_Fee__c !== null) {
            profile.ele('tns:Client_Counseling_Fee').txt(record.Client_Counseling_Fee__c).up();
          }

          if(record.Client_Attribute_HUD_Grant__c) {
            profile.ele('tns:Client_Attribute_HUD_Grant').txt(record.Client_Attribute_HUD_Grant__c).up();
          }
          if(record.Client_Grant_Amount_Used__c) {
            profile.ele('tns:Client_Grant_Amount_Used').txt(record.Client_Grant_Amount_Used__c).up();
          }
          if(record.Client_HECM_Certificate__c) {
            profile.ele('tns:Client_HECM_Certificate').txt(record.Client_HECM_Certificate__c).up();
          }

          if(record.Client_HECM_Certificate_Issue_Date__c) {
            var date_format = new Date(record.Client_HECM_Certificate_Issue_Date__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_HECM_Certificate_Issue_Date').txt(formatted_date).up();
          }
          if(record.Client_HECM_Certificate_Expiration_Date__c) {
            var date_format = new Date(record.Client_HECM_Certificate_Expiration_Date__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_HECM_Certificate_Expiration_Date').txt(formatted_date).up();
          }

          if(record.Client_HECM_Certificate_ID__c) {
            profile.ele('tns:Client_HECM_Certificate_ID').txt(record.Client_HECM_Certificate_ID__c).up();
          }
          if(record.Client_Predatory_Lending__c) {
            profile.ele('tns:Client_Predatory_Lending').txt(record.Client_Predatory_Lending__c).up();
          }
          if(record.Client_Mortgage_Type__c) {
            profile.ele('tns:Client_Mortgage_Type').txt(record.Client_Mortgage_Type__c).up();
          }
          if(record.Client_Mortgage_Type_After__c) {
            profile.ele('tns:Client_Mortgage_Type_After').txt(record.Client_Mortgage_Type_After__c).up();
          }
          if(record.Client_Finance_Type_Before__c) {
            profile.ele('tns:Client_Finance_Type_Before').txt(record.Client_Finance_Type_Before__c).up();
          }

          if(record.Client_Finance_Type_After__c) {
            profile.ele('tns:Client_Finance_Type_After').txt(record.Client_Finance_Type_After__c).up();
          }
          if(record.Client_FirstTime_Home_Buyer__c) {
            profile.ele('tns:Client_FirstTime_Home_Buyer').txt(record.Client_FirstTime_Home_Buyer__c).up();
          }
          if(record.Client_Discrimination_Victim__c) {
            profile.ele('tns:Client_Discrimination_Victim').txt(record.Client_Discrimination_Victim__c).up();
          } else {
            profile.ele('tns:Client_Discrimination_Victim').txt('N').up();
          }
          if(record.Client_Mortgage_Closing_Cost__c) {
            profile.ele('tns:Client_Mortgage_Closing_Cost').txt(record.Client_Mortgage_Closing_Cost__c).up();
          }
          if(record.Client_Mortgage_Interest_Rate__c) {
            profile.ele('tns:Client_Mortgage_Interest_Rate').txt(record.Client_Mortgage_Interest_Rate__c).up();
          }
          if(record.Client_Referred_By__c) {
            profile.ele('tns:Client_Referred_By').txt(record.Client_Referred_By__c).up();
          }
          if(record.Client_Sales_Contract_Signed__c) {
            var date_format = new Date(record.Client_Sales_Contract_Signed__c);
            const formatted_date = ('0' + (date_format.getMonth()+1)).slice(-2) + '-'
              + ('0' + date_format.getDate()).slice(-2) + '-'
              + date_format.getFullYear();
            profile.ele('tns:Client_Sales_Contract_Signed').txt(formatted_date).up();
          }
          if(record.Client_Credit_Score__c) {
            profile.ele('tns:Client_Credit_Score').txt(record.Client_Credit_Score__c).up();
          }
          if(record.Client_No_Credit_Score_Reason__c) {
            profile.ele('tns:Client_No_Credit_Score_Reason').txt(record.Client_No_Credit_Score_Reason__c).up();
          }
          if(record.Client_Credit_Score_Source__c) {
            profile.ele('tns:Client_Credit_Score_Source').txt(record.Client_Credit_Score_Source__c).up();
          }
          if(record.Client_Job_Duration__c !== null) {
            profile.ele('tns:Client_Job_Duration').txt(record.Client_Job_Duration__c).up();
          }

          if(record.Client_Household_Debt__c  !== null) {
            profile.ele('tns:Client_Household_Debt').txt(record.Client_Household_Debt__c).up();
          }

          if(record.Client_Mortgage_Deliquency__c) {
            profile.ele('tns:Client_Mortgage_Deliquency').txt(record.Client_Mortgage_Deliquency__c).up();
          }
          if(record.Client_Loan_Being_Reported__c) {
            profile.ele('tns:Client_Loan_Being_Reported').txt(record.Client_Loan_Being_Reported__c).up();
          }
          if(record.Client_Second_Loan_Exists__c) {
            profile.ele('tns:Client_Second_Loan_Exists').txt(record.Client_Second_Loan_Exists__c).up();
          }
          if(record.Client_Intake_Loan_Type__c) {
            profile.ele('tns:Client_Intake_Loan_Type').txt(record.Client_Intake_Loan_Type__c).up();
          }
          if(record.Client_Intake_Loan_Type_Is_Hybrid_ARM__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Hybrid_ARM').txt(record.Client_Intake_Loan_Type_Is_Hybrid_ARM__c).up();
          }
          if(record.Client_Intake_Loan_Type_Is_Option_ARM__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Option_ARM').txt(record.Client_Intake_Loan_Type_Is_Option_ARM__c).up();
          }
          if(record.Client_Intake_Loan_Type_Is_Interest_Only__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Interest_Only').txt(record.Client_Intake_Loan_Type_Is_Interest_Only__c).up();
          }
          if(record.Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_FHA_Or_VA_Insured').txt(record.Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c).up();
          }
          if(record.Loan_Type_Is_Privately_Held__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Is_Privately_Held').txt(record.Loan_Type_Is_Privately_Held__c).up();
          }
          if(record.Loan_Type_Has_Interest_Rate_Reset__c) {
            profile.ele('tns:Client_Intake_Loan_Type_Has_Interest_Rate_Reset').txt(record.Loan_Type_Has_Interest_Rate_Reset__c).up();
          }
          if(record.Client_Income_Level__c) {
            profile.ele('tns:Client_Income_Level').txt(record.Client_Income_Level__c).up();
          }
          if(record.Client_Purpose_Of_Visit__c) {
            profile.ele('tns:Client_Purpose_Of_Visit').txt(record.Client_Purpose_Of_Visit__c).up();
          }
          if(record.Client_Activity_Type__c) {
            profile.ele('tns:Client_Activity_Type').txt(record.Client_Activity_Type__c).up();
          }
          if(record.X9902ReportingQuarter__c) {
            profile.ele('tns:Client_9902_Reporting_Qtr').txt(record.X9902ReportingQuarter__c).up();
          }

          if(record.Client_Outcome__c) {
            const outcome = profile.ele('tns:Client_Outcomes')
            for(let s of record.Client_Outcome__c.split(';')) {
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
                conn.sobject("X9902__c").update({
                  Id : request.query.q,
                  ClientSubmissionStatus__c : submissionStatus
                }, function(err, ret) {
                  if (err || !ret.success) { return console.error(err, ret); }
                  console.log('Updated Successfully : ' + ret.id);

                });
              } else if(submissionStatus.indexOf('ERROR') != -1){
                console.log('### else submission status: ' + submissionStatus);
                console.log('### else submission status: ' + submissionStatus);
                conn.sobject("X9902__c").update({
                  Id : request.query.q,
                  ClientSubmissionStatus__c : resStatus.data
                }, function(err, ret) {
                  if (err || !ret.success) { return console.error(err, ret); }
                  console.log('Updated Successfully : ' + ret.id);
                  task.stop();
                });
              }

            });
          });

          conn.sobject("X9902__c").update({
            Id : request.query.q,
            ClientSubmissionID__c : submissionId
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
  });
});






app.get('/query-summary', (request, response) => {
  console.log('### query summary');
  const session = getSession(request, response);
  if (session == null) {
    return;
  }

  const query = 'select Id,Section_3_Total__c,Report_Period_Id__c,Activity_type_id__c,Hispanic__c,Non_Hispanic__c,No_Response__c,American_Indian__c,Asian__c,Black_African_American__c,Pacific_Islanders__c,\n' +
    '    White__c,AMINDWHT__c,ASIANWHT__c,BLKWHT__c,AMRCINDBLK__c,OtherMLTRC__c,MultiRace_No_Response__c,Section_4_Total__c,Less30_AMI_Level__c,A50_79_AMI_Level__c,A30_49_AMI_Level__c,A80_100_AMI_Level__c,\n' +
    '    Greater100_AMI_Level__c,AMI_No_Response__c,Section_5_Total__c,Household_Lives_In_Rural_Area__c,Household_Does_Not_Live_In_Rural_Area__c,Rural_Area_No_Response__c,Not_Limited_English_Proficient__c,\n' +
    '    Is_Limited_English_Proficient__c,Section_6_Total__c,Limited_English_Proficient_No_Response__c,Section_7_Total__c,Fair_Housing_Workshop__c,Fin_Lit_Workshop__c,Other_Workshop__c,Pred_Lend_Workshop__c,\n' +
    '    Rental_Workshop__c,Homeless_Prev_Workshop__c,Resolv_Prevent_Mortg_Delinq_Workshop__c,NonDelinqency_PostPurchase_Workshop__c,PrePurchase_HomeBuyer_Workshop__c,Section_8_Total__c,Homeless_Assistance_Counseling__c,\n' +
    '    Rental_Topics_Counseling__c,PrePurchase_HomeBuying_Counseling__c,Fin_Management_Counseling__c,Reverse_Mortgage_Counseling__c,Resolv_Prevent_Mortg_Delinq_Counseling__c,Section_9_Total__c,One_On_One_And_Group__c,\n' +
    '    Received_Info_Fair_Housing__c,Developed_Sustainable_Budget__c,Improved_Financial_Capacity__c,Gained_Access_Resources_Improve_Housing__c,Gained_Access_NonHousing_Resources__c,Homeless_Obtained_Housing__c,\n' +
    '    Rec_Rental_Counseling_Avoided_Eviction__c,Rec_Rental_Counseling_Living_Conditions__c,PrePurchase_Counseling_Purchased_Housing__c,Mortgage_Counseling_Obtained_HECM__c,NonDel_PostPur_Coun_Imp_Cond_Afford__c,\n' +
    '    Prevented_Resolved_Mortgage_Default__c,Section_10_Total__c,Completed_Disaster_Preparedness_Workshop__c,Disaster_Recover_Workshop__c,More_Than_one_Race__c,Forward_Mortgage_Delinquency_or_Default__c,\n' +
    '    Reverse_Mortgage_Delinquency_or_Default__c,Disaster_Recovery_Assistance__c,Disaster_Preparedness_Assistance__c,Disaster_Recovery_Non_housing_Resources__c,Disaster_Recovery_Housing_Resources__c,\n' +
    '    Emergency_Preparedness_Plan__c,Prevented_Forward_Mortgage_Default__c,Prevented_Reverse_Mortgage_Default__c,Forward_Mortgage_Mod_Improved_Financials__c,Forward_Mod_Improved_Financial_Capacity__c\n' +
    '    from X9902Summary__c where X9902__c = \'' + request.query.q + '\' AND Element_Type__c = \'9902\' ';

  console.log('### query: ' + query);

  if (!query) {
    response.status(400).send('Missing query parameter.');
    return;
  }
  const conn = resumeSalesforceConnection(session);

  conn.query('SELECT Name, EndpointURL__c, AgencyId__c, AgencyName__c, Username__c, Password__c, CMSPassword__c, VendorId__c FROM IntegrationSettings__c WHERE Name = \'HUD Settings\'', (error, customSetting) => {
    conn.query(query, (error, result) => {
      if (error) {
        console.error('Salesforce data API error: ' + JSON.stringify(error));
        response.status(500).json(error);
        return;
      } else {
        console.log('### customSetting: ' + JSON.stringify(customSetting));
        const settingVal = customSetting.records[0];
        let authHeader = 'Basic ' + Buffer.from(settingVal.Username__c + ':' + settingVal.Password__c).toString('base64');
        console.log('### authHeader: ' + authHeader);
        let lst9902 = result.records;

        let rptIdFlg = true;
        let root = create({ version: '1.0', encoding: 'UTF-8' })
          .ele('tns:SubmissionData', {
            'xsi:schemaLocation': 'http://gov.hud.arm/form_9902_databag_6_0 form_9902_databag_6_0.xsd',
            'xmlns:tns' : 'http://gov.hud.arm/form_9902_databag_6_0',
            'xmlns:xsi' : 'http://www.w3.org/2001/XMLSchema-instance'
          });


        let tagMap = {};
        tagMap['Report_Period_Id'] = 'Report_Period_Id__c';
        tagMap['Ethnicity_Households_Counseling_Hispanic'] = 'Hispanic__c';
        tagMap['Ethnicity_Households_Counseling_Non_Hispanic'] = 'Non_Hispanic__c';
        tagMap['Ethnicity_Households_Counseling_No_Response'] = 'No_Response__c';
        tagMap['Section_3_Total'] = 'Section_3_Total__c';
        tagMap['Race_Households_Counseling_American_Indian'] = 'American_Indian__c';
        tagMap['Race_Households_Counseling_Asian'] = 'Asian__c';
        tagMap['Race_Households_Counseling_Black_African_American'] = 'Black_African_American__c';
        tagMap['Race_Households_Counseling_American_Indian'] = 'American_Indian__c';
        tagMap['Race_Households_Counseling_Pacific_Islanders'] = 'Pacific_Islanders__c';
        tagMap['Race_Households_Counseling_White'] = 'White__c';
        tagMap['Race_Households_Counseling_More_Than_One_Race'] = 'More_Than_one_Race__c';
        tagMap['Race_Households_Counseling_No_Response'] = 'MultiRace_No_Response__c';
        tagMap['Section_4_Total'] = 'Section_4_Total__c';
        tagMap['Less30_AMI_Level'] = 'Less30_AMI_Level__c';
        tagMap['a30_49_AMI_Level'] = 'A30_49_AMI_Level__c';
        tagMap['a50_79_AMI_Level'] = 'A50_79_AMI_Level__c';
        tagMap['a80_100_AMI_Level'] = 'A80_100_AMI_Level__c';
        tagMap['Greater100_AMI_Level'] = 'Greater100_AMI_Level__c';
        tagMap['AMI_No_Response'] = 'AMI_No_Response__c';
        tagMap['Section_5_Total'] = 'Section_5_Total__c';
        tagMap['Lives_In_Rural_Area'] = 'Household_Lives_In_Rural_Area__c';
        tagMap['Does_Not_Live_In_Rural_Area'] = 'Household_Does_Not_Live_In_Rural_Area__c';
        tagMap['Rural_Area_No_Response'] = 'Rural_Area_No_Response__c';
        tagMap['Section_6_Total'] = 'Section_6_Total__c';
        tagMap['Limited_English_Proficient'] = 'Is_Limited_English_Proficient__c';
        tagMap['Not_Limited_English_Proficient'] = 'Not_Limited_English_Proficient__c';
        tagMap['Limited_English_Proficient_No_Response'] = 'Limited_English_Proficient_No_Response__c';
        tagMap['Section_7_Total'] = 'Section_7_Total__c';
        tagMap['Education_Compl_Fin_Lit_Workshop'] = 'Fin_Lit_Workshop__c';
        tagMap['Education_Compl_Pred_Lend_Workshop'] = 'Pred_Lend_Workshop__c';
        tagMap['Education_Compl_Fair_Housing_Workshop'] = 'Fair_Housing_Workshop__c';
        tagMap['Education_Compl_Homeless_Prev_Workshop'] = 'Homeless_Prev_Workshop__c';
        tagMap['Education_Compl_Rental_Workshop'] = 'Rental_Workshop__c';
        tagMap['Education_Compl_PrePurchase_HomeBuyer_Workshop'] = 'PrePurchase_HomeBuyer_Workshop__c';
        tagMap['Education_Compl_NonDelinqency_PostPurchase_Workshop'] = 'NonDelinqency_PostPurchase_Workshop__c';
        tagMap['Education_Compl_Resolv_Prevent_Mortg_Delinq_Workshop'] = 'Resolv_Prevent_Mortg_Delinq_Workshop__c';
        tagMap['Education_Compl_Disaster_Prepare_Workshop'] = 'Completed_Disaster_Preparedness_Workshop__c';
        tagMap['Education_Compl_Disaster_Recovery_Workshop'] = 'Disaster_Recover_Workshop__c';
        tagMap['Section_8_Total'] = 'Section_8_Total__c';
        tagMap['One_Homeless_Assistance_Counseling'] = 'Homeless_Assistance_Counseling__c';
        tagMap['One_Rental_Topics_Counseling'] = 'Rental_Topics_Counseling__c';
        tagMap['One_PrePurchase_HomeBuying_Counseling'] = 'PrePurchase_HomeBuying_Counseling__c';
        tagMap['One_Non_Delinq_Post_Purchase_Counseling'] = 'Fin_Management_Counseling__c';
        tagMap['One_Reverse_Mortgage_Counseling'] = 'Reverse_Mortgage_Counseling__c';
        tagMap['One_Resolv_Prevent_Fwd_Mortg_Delinq_Counseling'] = 'Forward_Mortgage_Delinquency_or_Default__c';
        tagMap['One_Resolv_Prevent_Rev_Mortg_Delinq_Counseling'] = 'Reverse_Mortgage_Delinquency_or_Default__c';
        tagMap['One_Disaster_Preparedness_Assistance_Counseling'] = 'Disaster_Preparedness_Assistance__c';
        tagMap['One_Disaster_Recovery_Assistance_Counseling'] = 'Disaster_Recovery_Assistance__c';
        tagMap['Section_9_Total'] = 'Section_9_Total__c';
        tagMap['Outcome_One_On_One_And_Education'] = 'One_On_One_And_Group__c';
        tagMap['Outcome_Received_Info_Fair_Housing'] = 'Received_Info_Fair_Housing__c';
        tagMap['Outcome_Developed_Budget'] = 'Developed_Sustainable_Budget__c';
        tagMap['Outcome_Improved_Financial_Capacity'] = 'Improved_Financial_Capacity__c';
        tagMap['Outcome_Gained_Access_Resources_Improve_Housing'] = 'Gained_Access_Resources_Improve_Housing__c';
        tagMap['Outcome_Gained_Access_NonHousing_Resources'] = 'Gained_Access_NonHousing_Resources__c';
        tagMap['Outcome_Homeless_Obtained_Housing'] = 'Homeless_Obtained_Housing__c';
        tagMap['Outcome_Gained_Access_Disaster_Recovery_NonHousing_Resources'] = 'Disaster_Recovery_Non_housing_Resources__c';
        tagMap['Outcome_Obtained_Disaster_Recovery_Housing_Resources'] = 'Disaster_Recovery_Housing_Resources__c';
        tagMap['Outcome_Developed_Emergency_Preparedness_Plan'] = 'Emergency_Preparedness_Plan__c';
        tagMap['Outcome_Received_Rental_Counseling_Avoided_Eviction'] = 'Rec_Rental_Counseling_Avoided_Eviction__c';
        tagMap['Outcome_Received_Rental_Counseling_Improved_Living_Conditions'] = 'Rec_Rental_Counseling_Living_Conditions__c';
        tagMap['Outcome_Received_PrePurchase_Counseling_Purchased_Housing'] = 'PrePurchase_Counseling_Purchased_Housing__c';
        tagMap['Outcome_Received_Reverse_Mortgage_Counseling_Obtained_HECM'] = 'Mortgage_Counseling_Obtained_HECM__c';
        tagMap['Outcome_Received_NonDelinquency_PostPurchase_Counseling_Improve_Conditions_Affordability'] = 'NonDel_PostPur_Coun_Imp_Cond_Afford__c';
        tagMap['Outcome_Prevented_Resolved_Forward_Mortgage_Default'] = 'Prevented_Forward_Mortgage_Default__c';
        tagMap['Outcome_Prevented_Resolved_Reverse_Mortgage_Default'] = 'Prevented_Reverse_Mortgage_Default__c';
        tagMap['Outcome_Received_Forward_Mortgage_Modification_Remain_Current_In_Modified_Mortgage'] = 'Forward_Mortgage_Mod_Improved_Financials__c';
        tagMap['Outcome_Received_Forward_Mortgage_Modification_Improved_Financial_Capacity'] = 'Forward_Mod_Improved_Financial_Capacity__c';
        tagMap['Section_10_Total'] = 'Section_10_Total__c';


        // .ele('tns:Form_9902');
        const top_data_node = root.ele('tns:Form_9902');
        console.log('### finish tag map: ' + JSON.stringify(tagMap));
        console.log('###lst9902: ' + JSON.stringify(lst9902));
        for(const [key, value] of Object.entries(tagMap)) {
          for (let objAp of lst9902) {
            let actType = objAp.Activity_type_id__c.toString();
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
        console.log('### finish first set of params');

        root.up();
        let gstagMap = {};
        let gsatagMap = {};
        let atagMap = {};
        gstagMap['Group_Session_Id'] = 'Group_Session_Id__c';
        gstagMap['Group_Session_Counselor_Id'] = 'Group_Session_Counselor_Id__c';
        gstagMap['Group_Session_Counselor_HUD_Id'] = 'Group_Session_Counselor_HUD_Id__c';
        gstagMap['Group_Session_Title'] = 'Group_Session_Title__c';
        gstagMap['Group_Session_Date'] = 'Group_Session_Date__c';
        gstagMap['Group_Session_Duration'] = 'Group_Session_Duration__c';
        gstagMap['Group_Session_Type'] = 'Group_Session_Type__c';
        gstagMap['Group_Session_Attribute_HUD_Grant'] = 'Group_Session_Attribute_HUD_Grant__c';
        gstagMap['Group_Session_Activity_Type'] = 'Group_Session_Activity_Type__c';
        gsatagMap['Attendee_Id'] = 'Group_Session_Attendee_Id__c';
        gsatagMap['Attendee_Fee_Amount'] = 'Attendee_Fee_Amount__c';
        gsatagMap['Attendee_Referred_By'] = 'Attendee_Referred_By__c';
        gsatagMap['Attendee_FirstTime_Home_Buyer'] = 'Attendee_FirstTime_Home_Buyer__c';
        gsatagMap['Attendee_Income_Level'] = 'Group_Session_Attendee_Income_Level__c';
        gsatagMap['Attendee_City'] = 'Group_Session_Attendee_City__c';
        gsatagMap['Attendee_State'] = 'Group_Session_Attendee_State__c';
        gsatagMap['Attendee_Zip_Code'] = 'Group_Session_Attendee_Zip_Code__c';
        gsatagMap['Attendee_Rural_Area'] = 'Group_Session_Attendee_Rural_Area_Status__c';
        gsatagMap['Attendee_Limited_English_Proficiency'] = 'Grp_Attendee_Limited_English_Proficiency__c';
        atagMap['Attendee_Id'] = 'Attendee_ID__c';
        atagMap['Attendee_Income_Level'] = 'Attendee_Income_Level__c';
        atagMap['Attendee_City'] = 'Attendee_City__c';
        atagMap['Attendee_State'] = 'Attendee_State__c';
        atagMap['Attendee_Zip_Code'] = 'Attendee_Zip_Code__c';
        atagMap['Attendee_Rural_Area'] = 'Attendee_Rural_Area__c';
        atagMap['Attendee_Limited_English_Proficiency'] = 'Attendee_Limited_English_Proficiency__c';
        atagMap['Attendee_Race_ID'] = 'Attendee_Race_ID__c';
        atagMap['Attendee_Ethnicity_ID'] = 'Attendee_Ethnicity_ID__c';
        console.log('### built tag map');

        let gsalst9902 = [];
        let gslst9902 = [];
        let alst9902 = [];
        let GSMap = {};
        const groupSessionQuery = 'select Id,Group_Session_Id__c,Group_Session_Counselor_Id__c,Group_Session_Counselor_HUD_Id__c,Group_Session_Title__c,Group_Session_Date__c,\n' +
          '  Group_Session_Duration__c,Group_Session_Type__c,Group_Session_Attribute_HUD_Grant__c,Group_Session_Activity_Type__c\n' +
          '  from X9902Summary__c where X9902__c = \'' + request.query.q + '\'  AND Element_Type__c = \'Group Session\' AND Group_Session_Id__c != NULL';
        const groupSessionAttendeeQuery = 'select Id,Group_Session_Id__c,Group_Session_Attendee_ID__c,Attendee_Fee_Amount__c,Attendee_Referred_By__c,Attendee_FirstTime_Home_Buyer__c,Group_Session_Attendee_Income_Level__c,\n' +
          '  Group_Session_Attendee_Address_1__c,Group_Session_Attendee_Address_2__c,Group_Session_Attendee_City__c,Group_Session_Attendee_State__c,Group_Session_Attendee_Zip_Code__c,\n' +
          '  Group_Session_Attendee_Rural_Area_Status__c,Grp_Attendee_Limited_English_Proficiency__c\n' +
          '  from X9902Summary__c where X9902__c = \'' + request.query.q + '\' AND Element_Type__c = \'Group Session Attendee\' AND Group_Session_Id__c != NULL';
        const attendeeQuery = 'select Id,Attendee_ID__c,Attendee_Fname__c,Attendee_Lname__c,Attendee_Mname__c,Attendee_Income_Level__c,Attendee_Address_1__c,Attendee_Address_2__c,\n' +
          '  Attendee_City__c,Attendee_State__c,Attendee_Zip_Code__c,Attendee_Rural_Area__c,Attendee_Limited_English_Proficiency__c,Attendee_Race_ID__c,Attendee_Ethnicity_ID__c\n' +
          '  from X9902Summary__c where X9902__c = \'' + request.query.q + '\' AND Element_Type__c = \'Attendee\'';
        conn.query(groupSessionQuery, (error, result) => {
          console.log('### got first results');
          gslst9902 = result.records;
          conn.query(groupSessionAttendeeQuery, (error, result) => {
            console.log('### got second results');
            gsalst9902 = result.records;
            conn.query(attendeeQuery, (error, result) => {
              console.log('### got third results');
              alst9902 = result.records;

              console.log('### processing 1');
              for(let gs of gslst9902){
                GSMap[gs.Group_Session_Id__c] = gs;
              }


              console.log('### processing 1 end');
              const group_sessions = root.ele('tns:Group_Sessions');

              for(const [sumKey, value] of Object.entries(GSMap)) {
                let objAP1 = GSMap[sumKey];
                const profile = group_sessions.ele('tns:Group_Session');

                for(const [key, value] of Object.entries(gstagMap)) {

                  if(objAP1[gstagMap[key]]) {
                    if (key == 'Group_Session_Date') {
                      console.log('### session date: ' + objAP1[gstagMap[key]]);
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
                      console.log('### objAP2: ' + JSON.stringify((objAP2)));
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

              console.log('### processing 2');

              const attendees = root.ele('tns:Attendees');
              for(let objAp of alst9902) {
                const attendee = attendees.ele('tns:Attendee');
                for (const [key, value] of Object.entries(atagMap)) {
                  if(objAp[atagMap[key]]) {
                    attendee.ele('tns:' + key).txt(objAp[atagMap[key]]).up();
                  }
                }

              }

              console.log('### made it through processing');
              root.up();
              const xml = root.end({ prettyPrint: true });
              console.log(xml);


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

              console.log('### about to post')
              axios.post(settingVal.EndpointURL__c, finalBody, config).then(res => {
                console.log('### called axios');
                console.log('### got res: ', res.data);
                let submissionId = res.data.substring(res.data.indexOf('<submissionId>')+14, res.data.indexOf('</submissionId>'));

                  let statusXml ='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.arm.hud.gov/"><soapenv:Header></soapenv:Header>' +
                    '<soapenv:Body><ser:getSubmissionInfo><ser:agcHcsId>'+settingVal.AgencyID__c+'</ser:agcHcsId><ser:submissionId>'+submissionId+'</ser:submissionId></ser:getSubmissionInfo></soapenv:Body></soapenv:Envelope>';

                  let task = cron.schedule('* * * * *', () => {
                    axios.post(settingVal.EndpointURL__c, statusXml, config).then(resStatus => {
                      console.log('### submission id: ' + submissionId);
                      let submissionStatus = resStatus.data.substring(resStatus.data.indexOf('<statusMessage>')+15,resStatus.data.indexOf('</statusMessage>'));

                      console.log('### submissionStatus: ' + submissionStatus);
                      if(submissionStatus == 'DONE') {
                        conn.sobject("X9902__c").update({
                          Id : request.query.q,
                          Summary9902SubmissionStatus__c : submissionStatus
                        }, function(err, ret) {
                          if (err || !ret.success) { return console.error(err, ret); }
                          console.log('Updated Successfully : ' + ret.id);
                          task.stop();
                        });
                      } else if(submissionStatus.indexOf('ERROR') != -1){
                        console.log('### else submission status: ' + submissionStatus);
                        conn.sobject("X9902__c").update({
                          Id : request.query.q,
                          Summary9902SubmissionStatus__c : resStatus.data
                        }, function(err, ret) {
                          if (err || !ret.success) { return console.error(err, ret); }
                          console.log('Updated Successfully : ' + ret.id);
                          task.stop();
                        });
                      }

                    });
                  });


                  conn.sobject("X9902__c").update({
                    Id : request.query.q,
                    Summary9902SubmissionID__c : submissionId,
                  }, function(err, ret) {
                    if (err || !ret.success) { return console.error(err, ret); }
                    console.log('Updated Successfully : ' + ret.id);
                    response.json({ submissionId: submissionId, sentXml: xml });
                  });




              }).catch(err => {
                console.log('### err axios: ' + err);

              });
            });
          });
        });
      }
    });
  });
});

app.listen(app.get('port'), () => {
  console.log('### running on port: ' + app.get('port'));
});
