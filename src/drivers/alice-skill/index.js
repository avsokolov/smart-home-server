const AbstractDriver = require('../abstract-driver');
const {
    DriverMethodInfo,
    DriverMethodArgument,
    DriverPropertyInfo,
    PropTypes
} = require('../../shared');
const { processQuery, authorize } = require('./implementation');

const state = {
    unauthorizedUsers: [],
    processedRequest: 0,
};

module.exports = class AliceSkill extends AbstractDriver {
    constructor(name) {
        super(
            name,
            'Yandex.Alice skill driver',
            {
                methods: [
                    new DriverMethodInfo(
                        'allow',
                        [new DriverMethodArgument('id', PropTypes.string)],
                        PropTypes.boolean,
                    ),
                ],
                state: [
                    new DriverPropertyInfo('requests', 'processed requests counter', PropTypes.number),
                    new DriverPropertyInfo(
                        'tempUsers',
                        'unauthorized users',
                        PropTypes.array,
                        { arrayType: PropTypes.string }),
                ]
            },
        );

        this.interface.allow = id => this.allow(id);
        this.setState(state);
    }

    allow(id) {
        if (!state.unauthorizedUsers.includes(id)) {
            return false;
        }

        state.unauthorizedUsers = state.unauthorizedUsers.filter(userId => userId !== id);
        authorize(id);
        return true;
    }

    get restApi() {
        return {
            '/': {
                allowUnauthorized: true,
                methods: ['POST'],
            }
        };
    }

    async restRequest(method, path, request) {
        return { code: 200, body: await processQuery(request.body) };
    }
};
