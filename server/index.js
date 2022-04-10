// 3rd party dependencies
const path = require('path'),
  express = require('express'),
  session = require('express-session'),
  jsforce = require('jsforce');
const axios = require('axios');
const { create } = require('xmlbuilder2');

const {custom} = require("@salesforce-ux/design-system/design-tokens/dist/bg-standard.common");


// Load and check config
require('dotenv').config();
if (!(process.env.loginUrl && process.env.consumerKey && process.env.consumerSecret && process.env.callbackUrl && process.env.apiVersion && process.env.sessionSecretKey)) {
  console.error('Cannot start app: missing mandatory configuration. Check your .env file.');
  process.exit(-1);
}

// Instantiate Salesforce client with .env configuration
const oauth2 = new jsforce.OAuth2({
  loginUrl: process.env.loginUrl,
  clientId: process.env.consumerKey,
  clientSecret: process.env.consumerSecret,
  redirectUri: process.env.callbackUrl
});

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
    '                                         Client_Street_Address_1__c,Client_Street_Address_2__c,Client_State__c,Client_Zip__c,Client_New_Street_Address_1__c,Client_New_Street_Address_2__c,\n' +
    '                                         Client_New_City__c,Client_New_State__c,Client_New_Zip__c,Client_Phone_Num__c,Client_Mobile_Phone_Num__c,Client_Fax__c,Client_Email__c,Client_Family_Size__c,\n' +
    '                                         Client_Gender__c,Client_Marital_Status__c,Client_Race_ID__c,Client_Ethnicity_ID__c,Client_Household_Gross_Monthly_Income__c,Client_Head_Of_Household_Type__c,\n' +
    '                                         Client_Birth_DT__c,Client_Counselor_ID__c,Client_Counselor_HUD_Id__c,Client_Highest_Educ_Grade__c,Client_Farm_Worker__c,Client_Rural_Area__c,Client_Limited_English_Proficiency__c,\n' +
    '                                         Client_Colonias_Resident__c,Client_HUD_Assistance__c,Client_Disabled__c,Client_Dependents_Num__c,Client_Intake_DT__c,Client_Counsel_Start_Session_DateTime__c,Client_Counsel_End_Session_DateTime__c,\n' +
    '                                         Client_Language_Spoken__c,Client_Session_Duration__c,Client_Counseling_Type__c,Client_Counseling_Termination__c,Client_Counseling_Fee__c,Client_Attribute_HUD_Grant__c,Client_Grant_Amount_Used__c,\n' +
    '                                         Client_HECM_Certificate__c,Client_HECM_Certificate_Issue_Date__c,Client_HECM_Certificate_Expiration_Date__c,Client_HECM_Certificate_ID__c,Client_Predatory_Lending__c,Client_Mortgage_Type__c,\n' +
    '                                         Client_Mortgage_Type_After__c,Client_Finance_Type_Before__c,Client_Finance_Type_After__c,Client_FirstTime_Home_Buyer__c,Client_Discrimination_Victim__c,Client_Mortgage_Closing_Cost__c,\n' +
    '                                         Client_Mortgage_Interest_Rate__c,Client_Referred_By__c,Client_Sales_Contract_Signed__c,Client_Credit_Score__c,Client_No_Credit_Score_Reason__c,Client_Credit_Score_Source__c,Client_Job_Duration__c,\n' +
    '                                         Client_Household_Debt__c,Client_Mortgage_Deliquency__c,Client_Spouse_First_Name__c,Client_Spouse_Last_Name__c,Client_Spouse_Middle_Name__c,Client_Spouse_SSN__c,Client_Loan_Being_Reported__c,\n' +
    '                                         Client_Second_Loan_Exists__c,Client_Intake_Loan_Type__c,Client_Intake_Loan_Type_Is_Hybrid_ARM__c,Client_Intake_Loan_Type_Is_Option_ARM__c,Client_Intake_Loan_Type_Is_FHA_Or_VA_Ins__c,\n' +
    '                                         Loan_Type_Is_Privately_Held__c,Client_Intake_Loan_Type_Is_Interest_Only__c,Client_Income_Level__c,Client_Purpose_Of_Visit__c,Client_Activity_Type__c,Client_City__c,\n' +
    '                                         Loan_Type_Has_Interest_Rate_Reset__c,Client_Outcome__c,X9902ReportingQuarter__c from X9902_Client__c where X9902__c = \'' + request.query.q +'\'';
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
          })
            .ele('tns:ClientProfiles');

        for(let record of result.records) {
          const profile = root.ele('tns:ClientProfile');
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
            profile.ele('tns:Client_Counselor_ID__c').txt(record.Client_Counselor_ID__c).up();
          }
          if(record.Client_Counselor_ID__c) {
            profile.ele('tns:Client_Counselor_HUD_Id').txt(record.Client_Counselor_ID__c).up();
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
          if(record.Client_Dependents_Num__c) {
            profile.ele('tns:Client_Dependents_Num').txt(record.Client_Dependents_Num__c).up();
          }

          /* DATE TIME MAY BE AN ISSUE!!!! */
          if(record.Client_Intake_DT__c) {
            //w.writeCharacters(String.valueOf(DateTime.newInstance(d5.year(),d5.month(),d5.day()).format('MM-dd-yyyy')));
            profile.ele('tns:Client_Intake_DT').txt(record.Client_Intake_DT__c).up();
          }
          if(record.Client_Counsel_Start_Session_DateTime__c) {
            //w.writeCharacters(String.valueOf(d.format('MM-dd-yyyy hh:mm')));
            profile.ele('tns:Client_Counsel_Start_Session_DateTime').txt(record.Client_Counsel_Start_Session_DateTime__c).up();
          }
          if(record.Client_Counsel_End_Session_DateTime__c) {
            //w.writeCharacters(String.valueOf(d.format('MM-dd-yyyy hh:mm')));
            profile.ele('tns:Client_Counsel_End_Session_DateTime').txt(record.Client_Counsel_End_Session_DateTime__c).up();
          }

          if(record.Client_Language_Spoken__c) {
            profile.ele('tns:Client_Language_Spoken').txt(record.Client_Language_Spoken__c).up();
          }
          if(record.Client_Session_Duration__c) {
            profile.ele('tns:Client_Session_Duration').txt(record.Client_Session_Duration__c).up();
          }
          if(record.Client_Counseling_Type__c) {
            profile.ele('tns:Client_Counseling_Type').txt(record.Client_Counseling_Type__c).up();
          }
          if(record.Client_Counseling_Termination__c) {
            profile.ele('tns:Client_Counseling_Termination').txt(record.Client_Counseling_Termination__c).up();
          }
          if(record.Client_Counseling_Fee__c) {
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
            // w.writeCharacters(String.valueOf(DateTime.newInstance(d2.year(),d2.month(),d2.day()).format('MM-dd-yyyy')));
            profile.ele('tns:Client_HECM_Certificate_Issue_Date').txt(record.Client_HECM_Certificate_Issue_Date__c).up();
          }
          if(record.Client_HECM_Certificate_Expiration_Date__c) {
            // w.writeCharacters(String.valueOf(DateTime.newInstance(d2.year(),d2.month(),d2.day()).format('MM-dd-yyyy')));
            profile.ele('tns:Client_HECM_Certificate_Expiration_Date').txt(record.Client_HECM_Certificate_Expiration_Date__c).up();
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
            // w.writeCharacters(String.valueOf(DateTime.newInstance(d4.year(),d4.month(),d4.day()).format('MM-dd-yyyy')));
            profile.ele('tns:Client_Sales_Contract_Signed').txt(record.Client_Sales_Contract_Signed__c).up();
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
          if(record.Client_Job_Duration__c) {
            profile.ele('tns:Client_Job_Duration').txt(record.Client_Job_Duration__c).up();
          }
          if(record.Client_Household_Debt__c) {
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
          '</ser:agcHcsId><ser:agcName>' + settingVal.AgencyName__c + '</ser:agcName><ser:fiscalYearId>' + '2022' + '</ser:fiscalYearId><ser:cmsVendorId>'+settingVal.VendorID__c+'</ser:cmsVendorId>' +
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
          conn.sobject("X9902__c").update({
            Id : request.query.q,
            ClientSubmissionID__c : submissionId
          }, function(err, ret) {
            if (err || !ret.success) { return console.error(err, ret); }
            console.log('Updated Successfully : ' + ret.id);
            response.send('Submission id: ' + submissionId);
          });



        }).catch(err => {
          console.log('### err axios: ' + err);

        });

      }
    });
  });
});



app.listen(app.get('port'), () => {
  console.log('Server started: http://localhost:' + app.get('port') + '/');
});
