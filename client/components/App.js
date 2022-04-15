import React from 'react';

import NavBar from './NavBar.js';
import LoginPanel from './LoginPanel.js';
import QueryForm from './QueryForm.js';
import QueryResults from './QueryResults.js';

export default class App extends React.Component {
  state = {
    user: null
  };

  componentDidMount() {
    // Get logged in user
    fetch('/auth/whoami', {
      method: 'get',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    }).then((response) => {
      if (response.ok) {
        response.json().then((json) => {
          this.setState({ user: json });
        });
      } else if (response.status !== 401) {
        // Ignore 'unauthorized' responses before logging in
        console.error('Failed to retrieve logged user.', JSON.stringify(response));
      }
    });
  }

  handleQueryExecution = (data) => {
    // Send SOQL query to server
    console.log('### data.query: ' + data.query);
    const queryUrl = '/query?q=' + encodeURI(data.query);
    console.log('### queryUrl: ' + queryUrl);
    fetch(queryUrl, {
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    }).then((response) => {

      response.json().then((json) => {
        console.log(json);

      });
      this.setState({ result : response.statusText });
    });
  };


  handleQueryExecutionSummary = (data) => {
    // Send SOQL query to server
    console.log('### execute summary data.query: ' + data.query);
    const queryUrl = '/query-summary?q=' + encodeURI(data.query);
    console.log('### queryUrl: ' + queryUrl);
    fetch(queryUrl, {
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    }).then((response) => {

      response.json().then((json) => {
        console.log(json);
      });
      console.log('### resp');
      console.log('### resp1: ', response);
      // response.json().then((json) => {
      //   console.log(json);
      //
      // });
      // this.setState({ result : response.statusText });
    });
  };

  render() {
    return (
      <div>
        <NavBar user={this.state.user} />
        {this.state.user == null ? (
          <LoginPanel />
        ) : (
          <div className="slds-m-around--xx-large">
            <QueryForm onExecuteQuery={this.handleQueryExecution} onExecuteQuerySummary={this.handleQueryExecutionSummary} />
            {this.state.result ? <QueryResults result={this.state.result} /> : null}
          </div>
        )}
      </div>
    );
  }
}
