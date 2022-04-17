import React from 'react';

export default class LoginPanel extends React.Component {
  state = {

    callbackUrl: 'https://nw-high-volume-submission.herokuapp.com/auth/callback',
    // callbackUrl: 'http://localhost:8080/auth/callback',
    // loginUrl: 'https://nwdev--nwcfeature.my.salesforce.com',
    // consumerKey: '3MVG9dPGzpc3kWyeqcLEX5BACy0XsxlXqHwUwWSf9_A48IPBBNKuWMaK8LlsIZqy6PTPvVWs6H5J1qvwAQ_KT',
    // consumerSecret: '3521049697DC9C55BD7B54FBE84AFA927835A874C27476C199FAF8C2E7780FF7',
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
      <div className="slds-modal slds-fade-in-open">
        <div className="slds-modal__container">
          <div className="slds-box slds-theme--shade">
            <p className="slds-text-heading--medium slds-m-bottom--medium">Welcome, please enter your connected app secrete and key:</p>

            <div className="slds-align--absolute-center">
              <div className="slds-form-element">
                <label className="slds-form-element__label" htmlFor="text-input-id-47">
                  Login Url
                </label>
                <div className="slds-form-element__control">
                  <input value={this.state.loginUrl} onChange={this.handleLoginUrl} placeholder="Login URL" className='slds-input'/>
                </div>
              </div>
            </div>

            <div className="slds-align--absolute-center">
              <div className="slds-form-element">
                <label className="slds-form-element__label" htmlFor="text-input-id-47">
                  Callback Url
                </label>
                <div className="slds-form-element__control">
                  <input value={this.state.callbackUrl} onChange={this.handleCallbackUrl} placeholder="Callback Url" className='slds-input'/>
                </div>
              </div>
            </div>

            <div className="slds-align--absolute-center">
              <div className="slds-form-element">
                <label className="slds-form-element__label" htmlFor="text-input-id-47">
                  Consumer Key
                </label>
                <div className="slds-form-element__control">
                  <input value={this.state.consumerKey} onChange={this.handleKey} placeholder="Consumer Key" className='slds-input'/>
                </div>
              </div>
            </div>

            <div className="slds-align--absolute-center">
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
