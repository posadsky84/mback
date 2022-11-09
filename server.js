const {Client} = require('pg');
const express = require("express");
const cors = require("cors");
const jwt = require('jsonwebtoken');

const FIXED_LOGIN = 'Admin';
const FIXED_PASSWORD = '12345678';

const JWT_SECRET = '68A9169C47139E6661AA6C35D218C';

const sql_tasks = (ddate) => `
select id id,
       name   name,
       checked    checked,
       score      score,
       category   category,
       duration   duration
  from tasklist
 where ddate = '${ddate}' 
order by id 
`;

const sql_ddates = (ddateb, ddatee) => `
select extract(
    day from tasklist.ddate
    ) as monthday,
       SUM(coalesce(tasklist.score,0)) score
  from tasklist
 where date(tasklist.ddate) between '${ddateb}' and '${ddatee}'    
group by monthday
order by monthday
`;



const sql_rating = `
select 
   games.id                  game_id,
   games.name                game_name,
   COUNT(distinct play.id)   cnt,
   players.id                player_id,
   players.name              player_name,
   COUNT(play_detail.play)   wins   
from
   play
   join games on play.game = games.id
   cross join players
   left outer join play_detail on play_detail.play = play.id and
                                  play_detail.player = players.id and
                                  play_detail.winner = TRUE
group by game_id, game_name, player_id, player_name`;


const app = express();
const port = 4000;

const jsonBodyMiddleware = express.json();
app.use(jsonBodyMiddleware);

app.use(cors());


app.use((req, res, next) => {
  if (/\/login.*/.test(req.url)) {
    return next();
  }
  const token = req.header('Authorization');
  if (!token) {
    res.status(401);
    res.json({message: "no token"});
    return;
  }
  const decodedToken = jwt.verify(token, JWT_SECRET);
  if (!decodedToken?.login) {
    res.status(401);
    res.json({message: "bad token"});
    return;
  }

  next();
});


const clientManihino = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'manihino',
  password: 'postgres',
  port: 5432,
});

const clientKeklog = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'keklog',
  password: 'postgres',
  port: 5432,
});

clientManihino.connect(); //Нужно наверное статус подключения проверять при запросе
clientKeklog.connect();


app.post("/login", async (req, res) => {
  const {login, password} = req.body;
  if (login === FIXED_LOGIN && password === FIXED_PASSWORD) {
    res.status(200);
    res.json({token: jwt.sign({login}, JWT_SECRET, {expiresIn: `1d`})})
  } else {
    res.status(401);
    res.json({message: "Wrong login/password"});
  }



});

app.get("/category", async (req, res) => {
  await clientKeklog.query(`select id, name, color from category order by id`, (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    ttt = resss.rows;
    res.status(200);
    res.json(ttt);
  });
});

app.get("/tasks", async (req, res) => {
  await clientKeklog.query(sql_tasks(req.query.ddate), (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    ttt = resss.rows;
    res.status(200);
    res.json(ttt);
  });
});

app.get("/ddates", async (req, res) => {
  await clientKeklog.query(sql_ddates(req.query.ddateb, req.query.ddatee), (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    ttt = resss.rows;
    res.status(200);
    res.json(ttt);
  });
});

app.put("/taskchecked/:id", async (req, res) => {
  await clientKeklog.query(
    `update tasklist set checked = ${req.body.checked} where id = ${req.params.id}`,
    (err, resss) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  res.status(200);
  res.json({message: "OK"});
});

app.delete("/deletetask/:id", async (req, res) => {
  await clientKeklog.query(
    `delete from tasklist where id = ${req.params.id}`,
    (err, resss) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  res.status(200);
  res.json({message: "OK"});
});

app.put("/taskcategory/:id", async (req, res) => {
  await clientKeklog.query(
    `update tasklist set category = ${req.body.category} where id = ${req.params.id}`,
    (err, resss) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  res.status(200);
  res.json({message: "OK"});
});

app.post("/newtask", async (req, res) => {

  await clientKeklog.query(
    `insert into tasklist (id, ddate, name) select nextval('tasklist_id'), '${req.body.ddate}', '${req.body.name}' RETURNING *;`,
    (err, resss) => {
      if (err) {
        console.error(err);
        return;
      } else {
        res.status(200);
        res.json(resss.rows[0]);
      }
    });

});



app.put("/taskscore/:id", async (req, res) => {

  console.log(req);

  await clientKeklog.query(
    `update tasklist set score = ${req.body.score} where id = ${req.params.id};`,
    (err, resss) => {
      if (err) {
        console.error(err);
        return;
      }


    });

  res.status(200);
  res.json({message: "OK"});

});

app.put("/taskduration/:id", async (req, res) => {

  console.log(req);

  await clientKeklog.query(
    `update tasklist set duration = ${req.body.duration} where id = ${req.params.id};`,
    (err, resss) => {
      if (err) {
        console.error(err);
        return;
      }


    });

  res.status(200);
  res.json({message: "OK"});

});




app.get("/rating", async (req, res) => {

  await clientManihino.query(sql_rating, (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }

    ttt = Object.values(resss.rows.reduce((result, curItem, curIndex, arr) => {
      return {
        ...result,
        [curItem.game_id]: {
          game_id: curItem.game_id,
          cnt: curItem.cnt,
          game_name: curItem.game_name,
          results: [
            ...(result[curItem.game_id]?.results || []),
            {
              player_id: curItem.player_id,
              player_name: curItem.player_name,
              wins: curItem.wins,
            },
          ]
        }
      };
    }, {})).sort((a, b) => +a.cnt < +b.cnt ? 1 : -1);

    res.status(200);
    res.json(ttt
    );
    //client.end();
  });
});


app.listen(port, () => {
  console.log("listening sample message");
});
