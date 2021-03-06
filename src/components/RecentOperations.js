import React from 'react';
import Panel from 'muicss/lib/react/panel';
import axios from 'axios';
import moment from 'moment';
import {clone, each, defaults} from 'lodash';
import AccountLink from './AccountLink';
import BigNumber from 'bignumber.js';

export default class RecentOperations extends React.Component {
  constructor(props) {
    super(props);
    this.props = defaults(props, {limit: 10});
    this.state = {loading: true, operations: []};
    this.getRecentOperations();
  }

  onNewOperation(operation) {
    if (this.props.account) {
      if (this.props.account !== operation.source_account &&
        // payment/path_payment
        this.props.account !== operation.to &&
        // change_trust/allow_trust
        this.props.account !== operation.trustee) {
        return;
      }
    }
    let operations = clone(this.state.operations);
    operation.createdAtMoment = moment(); // now
    operations.unshift(operation);
    operations.pop();
    this.setState({operations});
  }

  getRecentOperations() {
    let url = `${this.props.horizonURL}/operations`;
    if (this.props.account) {
      url = `${this.props.horizonURL}/accounts/${this.props.account}/operations`;
    }
    axios.get(`${url}?order=desc&limit=${this.props.limit}`)
      .then(response => {
        let records = response.data._embedded.records;
        let operations = this.state.operations;
        each(records, operation => {
          if (!this.pagingToken) {
            this.pagingToken = operation.paging_token;
          }
          this.state.operations.push(operation);
        })
        this.setState({operations});
        for (let i = 0; i < operations.length; i++) {
          this.getTransactionTime(operations[i]);
        }
        // Start listening to events
        this.props.emitter.addListener(this.props.newOperationEventName, this.onNewOperation.bind(this))
      });
  }

  getTransactionTime(op) {
    axios.get(op._links.transaction.href)
      .then(tx => {
        let operations = clone(this.state.operations);
        for (let i = 0; i < operations.length; i++) {
          if (operations[i].id == op.id) {
            operations[i].createdAtMoment = moment(tx.data.created_at);
            operations[i].ago = operations[i].createdAtMoment.fromNow(true);
            break;
          }
        }
        this.setState({operations});
      });
  }

  updateAgo() {
    let operations = clone(this.state.operations);
    for (let i = 0; i < operations.length; i++) {
      operations[i].ago = operations[i].createdAtMoment.fromNow(true);
    }
    this.setState({operations});
  }

  componentDidMount() {
    // Update seconds ago
    this.timerID = setInterval(() => this.updateAgo(), 10*1000);
  }

  componentWillUnmount() {
    clearInterval(this.timerID);
  }

  amount(am, asset_type, asset_code) {
    // Strip zeros and `.`
    let amount = new BigNumber(am).toFormat(7).replace(/\.*0+$/, '');
    let code;
    if (asset_type == "native") {
      code = <i>XLM</i>
    } else {
      code = asset_code;
    }

    return <span>
      {amount} {code}
    </span>
  }

  operationTypeColRender(op) {
    switch (op.type) {
      case 'create_account':
        return <span>
          {this.amount(op.starting_balance, "native")} &raquo; <AccountLink horizonURL={this.props.horizonURL} id={op.account} known={this.props.account} />
        </span>;
      case 'payment':
        return <span>
          {this.amount(op.amount, op.asset_type, op.asset_code)} &raquo; <AccountLink horizonURL={this.props.horizonURL} id={op.to} known={this.props.account} />
        </span>;
      case 'path_payment':
        return <span>
          max {this.amount(op.source_max, op.source_asset_type, op.source_asset_code)} &raquo; {this.amount(op.amount, op.asset_type, op.asset_code)} &raquo; <AccountLink horizonURL={this.props.horizonURL} id={op.to} known={this.props.account} />
        </span>;
      case 'change_trust':
        return <span>
          {op.asset_code} issued by <AccountLink horizonURL={this.props.horizonURL} id={op.asset_issuer} known={this.props.account} />
        </span>;
      case 'allow_trust':
        return <span>
          {op.authorize ? "Allowed" : "Disallowed"} <AccountLink horizonURL={this.props.horizonURL} id={op.trustor} known={this.props.account} /> to hold {op.asset_code}
        </span>;
      case 'manage_offer':
      case 'create_passive_offer':
        return <span>
          Sell {this.amount(op.amount, op.selling_asset_type, op.selling_asset_code)} for {op.buying_asset_type == "native" ? <i>XLM</i> : op.buying_asset_code}
        </span>;
      case 'account_merge':
        return <span>&raquo; <AccountLink horizonURL={this.props.horizonURL} id={op.into} /></span>
      case 'manage_data':
        return <span>Key: <code>{op.name.length <= 20 ? op.name : op.name.substr(0, 20)+'...'}</code></span>
    }
  }

  render() {
    return (
      <Panel>
        <div className="widget-name">
          Recent operations: {this.props.label} {this.props.account ? this.props.account.substr(0, 4) : ''}
        </div>
        <table className="mui-table small">
        <thead>
          <tr>
            <th>Source</th>
            <th>Operation</th>
            <th>Details</th>
            <th>Time ago</th>
          </tr>
        </thead>
        <tbody>
          {
            this.state.operations.map(op => {
              return <tr key={op.id}>
                <td><AccountLink horizonURL={this.props.horizonURL} id={op.source_account} known={this.props.account} /></td>
                <td><a href={op._links.self.href} target="_blank">{op.type == 'create_passive_offer' ? 'passive_offer' : op.type}</a></td>
                <td>{this.operationTypeColRender(op)}</td>
                <td>{op.ago ? op.ago : 'Loading...'}</td>
              </tr>
            })
          }
        </tbody>
      </table>
      </Panel>
    );
  }
}
