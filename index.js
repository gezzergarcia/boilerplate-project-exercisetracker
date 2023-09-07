const express = require('express');
const bodyParser = require('body-parser');

const log = require('debug')('app');
const logGet = require('debug')('app-get');
const logPost = require('debug')('app-post');

const app = express();

const cors = require('cors');

// Set up mongoose connection
const mongoose = require('mongoose');

const { Schema } = mongoose;

mongoose.set('strictQuery', false);

const devDBurl = 'mongodb+srv://mongodbuser:WKkTZvgGbNIdTCIq@cluster0.gqecskk.mongodb.net/exercise_tracker?retryWrites=true&w=majority';
const mongoDB = process.env.MONGO_URL || devDBurl;

async function main() {
  log('conectando a mongo...');

  try {
    await mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });
    log('Conexión exitosa a MongoDB.');
  } catch (error) {
    log('Error al conectar a MongoDB:', error);
  }

  const db = mongoose.connection;

  // eslint-disable-next-line no-console
  db.on('error', console.error.bind(console, 'Error de conexión a MongoDB:'));
  db.once('open', () => {
    log('Conexión abierta a MongoDB.');
  });
}
main().catch((err) => log(err));

const exerciseSchema = new mongoose.Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true },
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

require('dotenv').config();

/**
 * Middleware para parsear el body de las peticiones
 */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cors());

app.use(express.static('public'));

const fechaValidaRexexp = /^\d{4}-\d{2}-\d{2}$/;

/** Custom Error */
class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    log('CustomError', message, statusCode);
  }
}

/**
 * Devuelve un usuario por id
 * @param {*} userId
 * @param {*} requestBody
 * @returns
 */
function createExercise(userId, requestBody) {
  const { description, duration, date } = requestBody;
  return new Exercise({
    user: userId,
    description,
    duration: Number(duration),
    date: date ? new Date(date) : new Date(),
  });
}

/**
 * Crea un nuevo ejercicio para un usuario
 * @param {*} username
 * @param {*} exercise
 * @returns
 */
function createExerciseResponse(username, exercise) {
  return {
    username,
    description: exercise.description,
    duration: exercise.duration,
    date: exercise.date.toDateString(),
    _id: exercise.user,
  };
}

/**
 *
 * @param {*} user
 * @param {*} count
 * @param {*} exercises
 * @returns
 */
function createLogsResponse(user, count, exercises) {
  const logsArray = [];

  // array de logs
  exercises.forEach((exercise) => {
    logsArray.push({
      description: exercise.description,
      duration: exercise.duration,
      date: exercise.date.toDateString(),
    });
  });

  return {
    username: user.username,
    count,
    // eslint-disable-next-line no-underscore-dangle
    _id: user._id,
    log: logsArray,
  };
}
function validarFormatoFecha(fecha) {
  return fechaValidaRexexp.test(fecha);
}

/**
 * Valida los parámetros de la petición
 */
function validarParametros(from, to, limit) {
  log('validarParametros', from, to, limit);
  if (from) {
    // validar que from sea una fecha válida
    if (!Date.parse(from) || !validarFormatoFecha(from)) {
      throw new CustomError(`Invalid 'from' date: ${from}`, 400);
    }
  }
  if (to) {
    // validar que to sea una fecha válida
    if (!Date.parse(to) || !validarFormatoFecha(to)) {
      throw new CustomError(`Invalid 'to' date: ${to}`, 400);
    }
  }
  if (limit) {
    // validar que limit sea un número entero positivo
    if (Number.isNaN(limit) || !Number.isInteger(Number(limit)) || Number(limit) < 0) {
      throw new CustomError(`Invalid 'limit': ${limit}`, 400);
    }
    if (from && to) {
      // validar que from sea menor que to
      if (from > to) {
        throw new CustomError('"from" date must be before "to" date', 400);
      }
    }
  }
}

function getQuery(userid, from, to) {
  const query = { user: userid };
  if (Date.parse(from)) {
    query.date = { $gte: from };
  }
  if (Date.parse(to)) {
    if (query.date) {
      query.date.$lte = to;
    } else {
      query.date = { $lte: to };
    }
  }
  return query;
}

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/views/index.html`);
});

/**
 * Devuelve los ejercicios de un usuario
 */
app.get('/api/users/:id/logs', async (req, res) => {
  logGet(`api/users/${req.params.id}/logs`);
  logGet(`req.query.from: ${req.query.from}`);
  logGet(`req.query.to: ${req.query.to}`);
  logGet(`req.query.limit: ${req.query.limit}`);

  try {
    validarParametros(req.query.from, req.query.to, req.query.limit);

    const userId = req.params.id;

    // validar que id sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new CustomError(`Invalid user ID: ${userId}`, 400);
    }

    // validar que el usuario exista usando los parámetros de la petición
    const user = await User.findById(userId);

    if (!user) {
      throw new CustomError(`User not found with ID: ${userId}`, 404);
    }
    const startDate = new Date(req.query.from); // Fecha de inicio del rango
    const endDate = new Date(req.query.to); // Fecha de fin del rango
    log('startDate', startDate);
    log('endDate', endDate);
    const query = getQuery(userId, startDate, endDate);
    log('query', query);
    const count = await Exercise.countDocuments(query).exec();
    const exercises = await Exercise.find(query).limit(Number(req.query.limit)).exec();
    const response = createLogsResponse(user, count, exercises);

    // devolver todos los ejercicios del usuario
    res.json(response);
  } catch (error) {
    const errorMessage = error.message || 'An error occurred';
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * Devuelve todos los usuarios
 */
app.get('/api/users', async (req, res) => {
  logGet('/api/users');

  const users = await User.find({}).exec();
  log(users);

  res.json(users);
});

/**
 * Crea un nuevo ejercicio para un usuario
 */
app.post('/api/users/:id/exercises', async (req, res) => {
  logPost(`/api/users/${req.params.id}/exercises`);
  logPost(`req.body.description: ${req.body.description}`);
  logPost(`req.body.duration: ${req.body.duration}`);
  logPost(`req.body.date: ${req.body.date}`);

  try {
    const userId = req.params.id;

    // validar que id sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new CustomError(`Invalid user ID: ${userId}`, 400);
    }

    // validar que el usuario exista
    const user = await User.findById(userId);

    if (!user) {
      throw new CustomError(`User not found with ID: ${userId}`, 404);
    }

    // crear el nuevo ejercicio usando la información recibida en el body
    const newExercise = createExercise(userId, req.body);
    await newExercise.save();

    // devolver el usuario con el ejercicio añadido
    const response = createExerciseResponse(user.username, newExercise);

    res.json(response);
  } catch (error) {
    const errorMessage = error.message || 'An error occurred';
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * Crea un nuevo usuario
 */
app.post('/api/users', async (req, res) => {
  logPost('/api/users');
  logPost('req.body.username', req.body.username);

  try {
    const userExists = await User.exists({ username: req.body.username }).exec();
    log('userExists', userExists);

    if (!userExists) {
      const newUser = new User({ username: req.body.username });
      await newUser.save();
      log('newUser', newUser);
      res.json({
        username: newUser.username,
        // eslint-disable-next-line no-underscore-dangle
        _id: newUser._id,
      });
    } else {
      res.status(409).json({ error: 'Username already taken' });
    }
  } catch (error) {
    log(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  log(`Your app is listening on port ${listener.address().port}`);
});
