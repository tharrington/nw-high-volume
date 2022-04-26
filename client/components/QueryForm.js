import React from 'react';


export default class QueryForm extends React.Component {
  state = {
    // query: 'a2B5e000000FkkSEAS',
    // username: 'MX2310',
    // password: '8cs!Harm',
    // agencyid: '82310'
    query: '',
    username: '',
    password: '',
    agencyid: ''
  };

  handleSubmit = (e) => {
    e.preventDefault();
    const query = this.state.query.trim();
    console.log('### query: ' + query);
    if (!query) {
      return;
    }
    const data = {
      query : this.state.query,
      agencyid : this.state.agencyid,
      password : this.state.password,
      username : this.state.username,
    };
    this.props.onExecuteQuery(data);
  };

  handleSubmitSummary = (e) => {
    e.preventDefault();
    const query = this.state.query.trim();
    console.log('### query: ' + query);
    if (!query) {
      return;
    }
    const data = {
      query : this.state.query,
      agencyid : this.state.agencyid,
      password : this.state.password,
      username : this.state.username,
    };
    this.props.onExecuteQuerySummary(data);
  };

  handleQueryChange = (e) => {
    this.setState({ query: e.target.value });
  };

  handleAgencyChange = (e) => {
    this.setState({ agencyid: e.target.value });
  };
  handlePwChange = (e) => {
    this.setState({ password: e.target.value });
  };
  handleUsernameChange = (e) => {
    this.setState({ username: e.target.value });
  };

  render() {
    return (
      <form className="slds-form--stacked slds-m-bottom--xx-large" onSubmit={this.handleSubmit}>
        <div className="slds-form-element">
          <label className="slds-form-element__label slds-text-heading--medium" htmlFor="soqlQuery">
            <abbr className="slds-required" title="required">
              *
            </abbr>
            Enter 9902 Record Id
          </label>
          <div className="slds-form-element__control">
            <input id="soqlQuery" className="slds-input" placeholder="Enter a record id" value={this.state.query} onChange={this.handleQueryChange} required=""></input>
          </div>
        </div>
        <div className="slds-form-element">
          <label className="slds-form-element__label slds-text-heading--medium" htmlFor="soqlQuery">
            <abbr className="slds-required" title="required">
              *
            </abbr>
            Enter Username
          </label>
          <div className="slds-form-element__control">
            <input id="username" className="slds-input" placeholder="Enter Username" value={this.state.username} onChange={this.handleUsernameChange} required=""></input>
          </div>
        </div>
        <div className="slds-form-element">
          <label className="slds-form-element__label slds-text-heading--medium" htmlFor="soqlQuery">
            <abbr className="slds-required" title="required">
              *
            </abbr>
            Enter Password
          </label>
          <div className="slds-form-element__control">
            <input id="password" className="slds-input" placeholder="Enter Password" value={this.state.password} onChange={this.handlePwChange} required=""></input>
          </div>
        </div>
        <div className="slds-form-element">
          <label className="slds-form-element__label slds-text-heading--medium" htmlFor="soqlQuery">
            <abbr className="slds-required" title="required">
              *
            </abbr>
            Enter Agency Id
          </label>
          <div className="slds-form-element__control">
            <input id="agencyId" className="slds-input" placeholder="Enter Agency Id" value={this.state.agencyid} onChange={this.handleAgencyChange} required=""></input>
          </div>
        </div>

        <br/>
        <div className="slds-form-element slds-clearfix">
          <div className="slds-float--right">
            <button className="slds-button slds-button--brand" onClick={this.handleSubmit} disabled={!this.state.query.trim()}>
              <svg aria-hidden="true" className="slds-button__icon--stateful slds-button__icon--left">
                <use xlinkHref="/assets/icons/utility-sprite/svg/symbols.svg#check"></use>
              </svg>
              Submit Client Profiles
            </button>
          </div>
        </div>

        <br/>
        <div className="slds-form-element slds-clearfix">
          <div className="slds-float--right">
            <button className="slds-button slds-button--brand" onClick={this.handleSubmitSummary} disabled={!this.state.query.trim()}>
              <svg aria-hidden="true" className="slds-button__icon--stateful slds-button__icon--left">
                <use xlinkHref="/assets/icons/utility-sprite/svg/symbols.svg#check"></use>
              </svg>
              Submit Client Summary
            </button>
          </div>
        </div>
      </form>
    );
  }
}
