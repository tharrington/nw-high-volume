import React from 'react';

export default class LoginPanel extends React.Component {
  state = {
    // callbackUrl: 'http://localhost:8080/auth/callback',
    // loginUrl: 'https://testnwctrail1.my.salesforce.com',
    // consumerKey: '3MVG9cHH2bfKACZbf8KRjt_P6k_6SMMJAzsgESL9Vs4JEp.ntvIU7iGbkHU.DO67JRxgzylpoJtm2xzkYWzb0',
    // consumerSecret: '3C3404778B8AA888C25BDD1EED8AA82E59120034B0B2D7455354D023BB4C5D0C',
    callbackUrl: 'https://nw-high-volume-submission.herokuapp.com/auth/callback',
    loginUrl: '',
    consumerKey: '',
    consumerSecret: '',
  };

  login = (e) => {
    console.log('### state', this.state);
    const endpointUrl = '/auth/login?consumerKey=' + encodeURI(this.state.consumerKey) +
      '&callbackUrl=' + encodeURI(this.state.callbackUrl) +
      '&consumerSecret=' + encodeURI(this.state.consumerSecret) +
      '&loginUrl=' + encodeURI(this.state.loginUrl);
    console.log('### endpointUrl: ' + endpointUrl);
    window.location = endpointUrl;
  }

  handleLoginUrl = (e) => {
    this.setState({ loginUrl: e.target.value });
  };

  handleCallbackUrl = (e) => {
    this.setState({ callbackUrl: e.target.value });
  };

  handleKey = (e) => {
    this.setState({ consumerKey: e.target.value });
  };

  handleSecret = (e) => {
    this.setState({ consumerSecret: e.target.value });
  };


  render() {
    return (
      <div className="slds-grid">
        <div className="slds-col">
          <div className="slds-box slds-theme--shade">
            <p className="slds-text-heading--medium slds-m-bottom--medium">Welcome, please enter your connected app secret and key:</p>

            <div>
              <div className="slds-form-element">
                <label className="slds-form-element__label" htmlFor="text-input-id-47">
                  Login Url
                </label>
                <div className="slds-form-element__control">
                  <input value={this.state.loginUrl} onChange={this.handleLoginUrl} placeholder="Login URL" className='slds-input'/>
                </div>
              </div>
            </div>

            <div className="">
              <div className="slds-form-element">
                <label className="slds-form-element__label" htmlFor="text-input-id-47">
                  Consumer Key
                </label>
                <div className="slds-form-element__control">
                  <input value={this.state.consumerKey} onChange={this.handleKey} placeholder="Consumer Key" className='slds-input'/>
                </div>
              </div>
            </div>

            <div className="">
              <div className="slds-form-element">
                <label className="slds-form-element__label" htmlFor="text-input-id-47">
                  Consumer Secret
                </label>
                <div className="slds-form-element__control">
                  <input value={this.state.consumerSecret} onChange={this.handleSecret} placeholder="Consumer Secret" className='slds-input'/>
                </div>
              </div>
            </div>

            <br/>

            <div className="slds-align--absolute-center">
              <button onClick={this.login} className="slds-button slds-button--brand">
                <svg aria-hidden="true" className="slds-button__icon--stateful slds-button__icon--left">
                  <use xlinkHref="/assets/icons/utility-sprite/svg/symbols.svg#salesforce1"></use>
                </svg>
                Log in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
