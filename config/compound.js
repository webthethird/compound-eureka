
// trx: Send web3
// existing: Return "contract" from address, contract
// read: Read web3 data
// deploy: Deploys a contract

// Set a backend to store our known state
backend({
  file: `../state/${network}-state.json`
});

// Set a provider to use to talk to an Ethereum node
// TODO: Handle other networks here
let defaultProvider = () =>
  network === 'development' ? 'http://localhost:8545'
    : `https://${network}-eth.compound.finance`;

let defaultPk = () =>
  network === 'development' ? { unlocked: 0 }
    : { pk: fs.readFileSync(path.join(os.homedir(), '.ethereum', network), 'utf8') };

provider(env('provider', defaultProvider), {
  sendOpts: {
    from: env('pk', defaultPk),
    gas: 6000000,
    gasPrice: 100000000
  },
  verificationOpts: network !== 'development' && env('etherscan') ? {
    verify: true,
    etherscanApiKey: env('etherscan'),
    raiseOnError: true
  } : {}
});

// Define our contract configuration
if (network !== 'mainnet') {
  // Make sure we don't even define this on prod
  define("SimplePriceOracle", {
    properties: {
      prices: {
        deferred: true,
        dictionary: {
          key: 'ref',
          value: 'number'
        },
        setter: async ({trx}, oracle, prices) => {
          // TODO: Mutate prices as needed, versus always updating all of 'em
          return Promise.all(Object.entries(prices).map(([address, price]) => {
            return trx(oracle, 'setPrice', [address, price]);
          }));
        },
        getter: async (contract, props) => {
          // TODO: How do we iterate over known keys?
        }
      }
    },
    build: async ({deploy}, contract, props) => deploy(contract)
  });
}

define('InterestRateModel', {
  match: {
    properties: {
      type: 'linear'
    }
  },
  contract: 'WhitePaperInterestRateModel',
  properties: {
    type: 'string',
    base: 'number',
    slope: 'number'
  },
  build: ({deploy}, contract, {base, slope}) =>
    deploy(contract, {
      baseRatePerYear: base,
      multiplierPerYear: slope
    })
});

define('InterestRateModel', {
  match: {
    properties: {
      type: 'jump'
    }
  },
  contract: 'JumpRateModel',
  properties: {
    type: 'string',
    base: 'number',
    slope: 'number',
    jump: 'number',
    kink: 'number'
  },
  build: ({deploy}, contract, {base, slope, jump, kink}) =>
    deploy(contract, {
      baseRatePerYear: base,
      multiplierPerYear: slope,
      jumpMultiplierPerYear: jump,
      kink_: kink
    })
});

define('InterestRateModel', {
  match: {
    properties: {
      type: 'dsr'
    }
  },
  contract: 'DAIInterestRateModelV2',
  properties: {
    type: 'string',
    jump: 'number',
    kink: 'number',
    pot: { ref: 'Pot' },
    jug: { ref: 'Jug' }
  },
  build: ({deploy}, contract, {jump, kink, pot, jug}) =>
    deploy(contract, {
      jumpMultiplierPerYear: jump,
      kink_: kink,
      pot_: pot,
      jug_: jug
    })
});

define('CErc20Delegate', {
  contract: 'CErc20Delegate',
  build: async ({deploy}, contract, props) => deploy(contract)
});

define('CToken', {
  match: {
    properties: {
      type: 'immutable'
    }
  },
  contract: 'CErc20Immutable',
  properties: {
    type: 'string',
    symbol: 'string',
    name: 'string',
    admin: 'address',
    underlying: { ref: 'Erc20' },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    initial_exchange_rate: { type: 'number', default: 0.2e10 }, // TODO: Figure out default here
    interest_rate_model: {
      ref: 'InterestRateModel',
      setter: async ({trx}, cToken, newInterestRateModel) => {
        return await trx(cToken, '_setInterestRateModel', [newInterestRateModel]);
      }
    }
  },
  build: async ({deploy}, contract, { symbol, name, decimals, admin, underlying, comptroller, interest_rate_model, initial_exchange_rate }) => {
    return await deploy(contract, {
      underlying_: underlying,
      comptroller_: comptroller,
      interestRateModel_: interest_rate_model,
      initialExchangeRateMantissa_: initial_exchange_rate,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      admin_: admin
    });
  }
});

define('CToken', {
  match: {
    properties: {
      type: 'delegator'
    }
  },
  contract: 'CErc20Delegator',
  properties: {
    type: 'string',
    symbol: 'string',
    name: 'string',
    admin: 'address',
    underlying: { ref: 'Erc20' },
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    delegate: { ref: 'CErc20Delegate' },
    become_implementation_data: { type: 'string', default: '0x' }, // TODO: 'bytes'?
    initial_exchange_rate: { type: 'number', default: 0.2e10 }, // TODO: Figure out default here
    interest_rate_model: {
      ref: 'InterestRateModel',
      setter: async ({trx}, cToken, newInterestRateModel) => {
        return await trx(cToken, '_setInterestRateModel', [newInterestRateModel]);
      }
    }
  },
  build: async ({deploy}, contract, { symbol, name, decimals, admin, underlying, comptroller, interest_rate_model, initial_exchange_rate, delegate, become_implementation_data }) => {
    return await deploy(contract, {
      underlying_: underlying,
      comptroller_: comptroller,
      interestRateModel_: interest_rate_model,
      initialExchangeRateMantissa_: initial_exchange_rate,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      admin_: admin,
      implementation_: delegate,
      becomeImplementationData: become_implementation_data,
    });
  }
});

define('CToken', {
  match: {
    properties: {
      type: 'cether'
    }
  },
  contract: 'CEther',
  properties: {
    type: 'string',
    symbol: 'string',
    name: 'string',
    admin: 'address',
    comptroller: { ref: 'Unitroller' },
    decimals: { type: 'number', default: 8 },
    initial_exchange_rate: { type: 'number', default: 0.2e10 }, // TODO: Figure out default here
    interest_rate_model: {
      ref: 'InterestRateModel',
      setter: async ({trx}, cEther, newInterestRateModel) => {
        return await trx(cETher, '_setInterestRateModel', [newInterestRateModel]);
      }
    }
  },
  build: async ({deploy}, contract, { symbol, name, admin, comptroller, interest_rate_model, decimals, initial_exchange_rate }) => {
    return await deploy(contract, {
      comptroller_: comptroller,
      interestRateModel_: interest_rate_model,
      initialExchangeRateMantissa_: initial_exchange_rate,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      admin_: admin
    });
  }
});

define('Maximillion', {
  properties: {
    cEther: { ref: 'CToken' }
  },
  build: async ({deploy}, contract, { cEther }) => deploy(contract, [cEther])
});

define("Comptroller", {
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Unitroller", {
  properties: {
    oracle: {
      ref: 'PriceOracle',
      deferred: true,
      setter: async ({trx}, unitroller, oracle) => {
        await trx(unitroller, '_setPriceOracle', [oracle], { proxy: 'Comptroller' });
      }
    },
    implementation: {
      ref: 'Comptroller',
      deferred: true,
      setter: async ({trx}, unitroller, comptroller) => {
        await trx(unitroller, '_setPendingImplementation', [comptroller]);
        await trx(comptroller, '_become', [unitroller]);
      }
    },
    supported_markets: {
      type: 'array',
      deferred: true,
      setter: async ({read, show, trx}, unitroller, markets, { properties }) => {
        return await markets.reduce(async (acc, market) => {
          await acc; // Force ordering

          // TODO: Better handle proxy
          let marketData = await read(unitroller, 'markets', [market], { proxy: 'Comptroller' });

          if (!marketData.isListed) {
            return await trx(unitroller, '_supportMarket', [market], { proxy: 'Comptroller' });
          } else {
            console.log(`Market ${show(market)} already listed`);
          }
        });
      }
    },
    collateral_factors: {
      dictionary: {
        key: 'ref',
        value: 'number'
      },
      deferred: true,
      setter: async ({read, show, trx, bn}, unitroller, collateralFactors) => {
        return await Object.entries(collateralFactors).reduce(async (acc, [market, collateralFactor]) => {
          await acc; // Force ordering

          // TODO: Better handle proxy
          let marketRef = { type: 'ref', ref: market }; // TODO: Make this better
          let marketData = await read(unitroller, 'markets', [marketRef], { proxy: 'Comptroller' });

          // TODO: How do we compare these numbers? These base/exp numbers are getting in the way of being helpful...
          // Since now we really have 3-4 ways to represent numbers

          let current = bn(marketData.collateralFactorMantissa);
          let expected = bn(collateralFactor);
          if (!current.eq(expected)) {
            return await trx(unitroller, '_setCollateralFactor', [marketRef, expected], { proxy: 'Comptroller' });
          } else {
            console.log(`Market ${show(market)} already has correct collateral factor`);
          }
        });
      }
    }
  },
  build: async (actor, contract, {implementation, oracle, supported_markets}, { definition }) => {
    let deployed = await actor.deploy(contract);

    // We can't set these properties in the constructor, so they'll
    // need to be set by calling the setters directly
    if (implementation) {
      console.log("Setting implementation...");
      await definition.typeProperties.implementation.setter(actor, deployed, implementation);
    }

    if (supported_markets) {
      console.log("Supporting markets...");
      await definition.typeProperties.supported_markets.setter(actor, deployed, supported_markets);
    }

    if (collateral_factors) {
      console.log("Setting collateral factors...");
      await definition.typeProperties.collateral_factors.setter(actor, deployed, collateral_factors);
    }

    if (oracle) {
      console.log("Setting oracle...");
      await definition.typeProperties.oracle.setter(actor, deployed, oracle);
    }

    return deployed;
  }
});

define("CompoundLens", {
  build: async ({deploy}, contract, props) => deploy(contract)
});

define("Fauceteer", {
  build: async ({deploy}, contract, props) => deploy(contract)
});