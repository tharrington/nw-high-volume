import React from 'react';


export default class QueryForm extends React.Component {
  state = {
    query: 'a28e0000003fNVaAAM'
  };

  handleSubmit = (e) => {
    e.preventDefault();
    const query = this.state.query.trim();
    console.log('### query: ' + query);
    if (!query) {
      return;
    }
    this.props.onExecuteQuery({ query });
  };

  handleSubmitSummary = (e) => {
    e.preventDefault();
    const query = this.state.query.trim();
    console.log('### query: ' + query);
    if (!query) {
      return;
    }
    this.props.onExecuteQuerySummary({ query });
  };

  handleQueryChange = (e) => {
    this.setState({ query: e.target.value });
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
            <textarea id="soqlQuery" className="slds-textarea" placeholder="Enter a record id" value={this.state.query} onChange={this.handleQueryChange} required=""></textarea>
          </div>
        </div>

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
