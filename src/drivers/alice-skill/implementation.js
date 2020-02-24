const fs = require('fs');
const logger = require('../../shared').LoggerService.getLogger('alice-skill', process.pid.toString());
const users = Array.from(require('./users.json'));

const skillName = 'нафаня';
const extRequestMarkers = ['попроси', 'спроси', 'узнай', 'скажи'];
const stopWords = ['пока', 'спасибо', 'закончить', 'стоп'];

function checkAuth(data) {
    if (!users.includes(data.session.user_id)) {
        logger.warn('Alice request from not authorized user ' + data.session.user_id);

        return {
            unauthorizedUser: data.session.user_id,
            stopDialog: true,
            answer: 'Извините, но данный навык является приватным и не предназначен для публичного использования'
        };
    }

    return null;
}

function checkStopWords(text) {
    if (stopWords.includes(text)) {
        return {
            stopDialog: true,
            answer: 'Всегда рад помочь. Обращайтесь'
        };
    }

    return null;
}

function shouldAutoStop(data) {
    const fullRequest = data.request.original_utterance.toLocaleLowerCase();

    return (
      fullRequest.includes(` ${skillName.substr(0, skillName.length-2)}`) &&
      extRequestMarkers.some(extMarker => fullRequest.startsWith(extMarker))
    );
}

const commands = {
    ping: () => ({
        stopDialog: true,
        answer: 'pong',
        ignore: true,
    }),
};

const actions = {
    on: 'on',
    off: 'off',
    up: 'up',
    down: 'down',
};
const actionsMap = {
    on: ['включ', 'запус'],
    off: ['выкл', 'останов', 'гаси'],
    up: ['больше', 'ярче', 'увелич', 'громче'],
    down: ['меньше', 'темнее', 'уменьш', 'тише'],
};

const isKeyInText = (keys, text) => keys.some(key => text.includes(key));
const getAction = text => Object.keys(actionsMap).find(act => isKeyInText(actionsMap[act], text));

const features = [{
    keywords: ['свет'],
    variants: [{
        keywords: ['кухн'],
        action: () => {
          const act = getAction(text);
          if (act) {
            //TODO implement
            logger.info(`requested to ${act} kitchen light`);
            return Promise.resolve('готово');
          }
        },
    }],
    default: () => 'что бы это значило?',
}];

async function mapText(text) {
    const feature = features.find(f => isKeyInText(f.keywords, text));
    if (feature) {
        const variant = feature
            .variants
            .find(v => isKeyInText(v.keywords, text));

        let result;
        if (variant) {
            result = variant.action();
            if (result instanceof Promise) {
                result = await result;
            }
        }

        if (!result) {
            result = feature.default();
        }

        return result;
    }
}

async function processQuery(data) {
    if (commands[data.command]) {
        return commands[data.command](data);
    }

    let result = checkAuth(data);
    let text;
    if (!result) {
        text = data.request.command.toLocaleLowerCase();
        logger.info('text: '+data.request.original_utterance+', cmd: '+data.request.command);

        if (!text) {
            result = {
                stopDialog: false,
                answer: 'Здравствуйте, чем я могу вам помочь?'
            };
        }
    }

    if (!result) {
        result = checkStopWords(text);
    }

    if (!result) {
        const answer = await mapText(text) || 'Извините, но я вас не понимаю. Попробуйте переформулировать запрос';
        result = {
            answer,
            stopDialog: shouldAutoStop(data)
        };
    }

    return result;
}

function authorize(id) {
    users.push(id);
    const PATH = require.resolve('./users.json');
    fs.unlinkSync(PATH);
    fs.writeFileSync(PATH, JSON.stringify(users), 'utf8');
}

module.exports = { processQuery, authorize };
