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

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/views/index.html`);
});

app.get('/api/users/:id/logs', async (req, res) => {
  logGet(`api/users/${req.params.id}/logs`);

  try {
    const userId = req.params.id;

    // validar que id sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error(`Invalid user ID: ${userId}`);
    }

    // validar que el usuario exista
    const user = await User.findById(userId);

    if (!user) {
      // TODO: corregir json de error
      throw new Error(`User not found with ID: ${userId}`);
    }
    const count = await Exercise.countDocuments({ user: userId }).exec();
    const exercises = await Exercise.find({ user: userId }).exec();
    const response = createLogsResponse(user, count, exercises);

    // devolver todos los ejercicios del usuario
    res.json(response);
  } catch (error) {
    // TODO: corregir json de error
    const errorMessage = error.message || 'An error occurred';
    res.status(400).json({ error: errorMessage });
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
      // TODO: corregir json de error
      throw new Error(`Invalid user ID: ${userId}`);
    }

    // validar que el usuario exista
    const user = await User.findById(userId);

    if (!user) {
      // TODO: corregir json de error
      throw new Error(`User not found with ID: ${userId}`);
    }

    // crear el nuevo ejercicio usando la información recibida en el body
    const newExercise = createExercise(userId, req.body);
    await newExercise.save();

    // devolver el usuario con el ejercicio añadido
    const response = createExerciseResponse(user.username, newExercise);

    res.json(response);
  } catch (error) {
    // TODO: corregir json de error
    const errorMessage = error.message || 'An error occurred';
    res.status(400).json({ error: errorMessage });
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
      // TODO: corregir json de error
      res.json({ error: 'Username already taken' });
    }
  } catch (error) {
    log(error);
    // TODO: corregir json de error
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  log(`Your app is listening on port ${listener.address().port}`);
});
