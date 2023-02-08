const { Client } = require('pg');
const express = require("express");
const cors = require("cors");
const jwt = require('jsonwebtoken');

const FIXED_LOGIN = 'Admin';
const FIXED_PASSWORD = '12345678';

const JWT_SECRET = '68A9169C47139E6661AA6C35D218C';

const sql_tasks = (ddate) => `
select id id,
       name   "name",
       checked    checked,
       score      score,
       category   category,
       duration   duration
  from tasklist
 where ddate = '${ddate}' 
order by id 
`;

const sql_get_location = ddate => `select location from ddates where ddate = '${ddate}'`;

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

const sql_addPlay = (data) => `  
WITH genid AS 
(
insert into play (id, ddate, game, counts, comment)
values (nextval('play_id'), '${data.ddate}', ${data.gameId}, ${data.counts}, 
 ${data.comment ? "'"+data.comment+"'" : null}) returning id
)
insert into play_detail (play, player, score, winner)
values ${data.players.map((item) => {
  return `((select id from genid), ${item.playerId}, ${item.score}, ${item.winner})`;
}).toString()} returning play;`;


const sql_players = `select id, name from players`;
const sql_games = `select id, name from games`;

const sql_rating = ({season}) => `
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
                                  play_detail.winner = TRUE and
                                  play.counts = TRUE
 where play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)                         
group by game_id, game_name, player_id, player_name`;

const sql_calendar = ({season}) => `
select cast(play.ddate as char(10)) ddate,
       count(*) cnt
  from play 
 where play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)
 group by play.ddate
`;

const sql_playsDetailed = ({season = null, gameId = null, ddate = null}) => `
select play.id play_id, 
       cast(play.ddate as char(10)) ddate,
       play.counts counts,
       play.comment "comment",
       play.game game_id,
       games.name game_name,
       play_detail.player player_id,
       play_detail.score score,
       play_detail.winner winner
 from play
      join games on play.game = games.id
      left outer join play_detail on play.id = play_detail.play
where (play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)
       or ${season} is null) and
      (play.game = ${gameId} or ${gameId} is null) and
      (play.ddate = ${ddate} or ${ddate} is null)`;



const app = express();
const port = 4000;

const jsonBodyMiddleware = express.json();
app.use(jsonBodyMiddleware);

app.use(cors());


app.use((req, res, next) => {

  //Закомменчено ради Манихино - там нет авторизации. Как быть пока неясно

  // if (/\/login.*/.test(req.url)) {
  //   return next();
  // }
  // const token = req.header('Authorization');
  // if (!token) {
  //   res.status(401);
  //   res.json({message: "no token"});
  //   return;
  // }
  // const decodedToken = jwt.verify(token, JWT_SECRET);
  // if (!decodedToken?.login) {
  //   res.status(401);
  //   res.json({message: "bad token"});
  //   return;
  // }

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
  const { login, password } = req.body;
  if (login === FIXED_LOGIN && password === FIXED_PASSWORD) {
    res.status(200);
    res.json({ token: jwt.sign({ login }, JWT_SECRET, { expiresIn: `1d` }) })
  } else {
    res.status(401);
    res.json({ message: "Wrong login/password" });
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

app.get("/location", async (req, res) => {
  await clientKeklog.query(sql_get_location(req.query.ddate), (err, resss) => {
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
  res.json({ message: "OK" });
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
  res.json({ message: "OK" });
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
  res.json({ message: "OK" });
});

app.post("/addPlay", async (req, res) => {
  console.log(sql_addPlay(req.body));
  await clientManihino.query(sql_addPlay(req.body),
    (err, resss) => {
      if (err) {
        console.error(err);
      } else {
        res.status(200);
        res.json(resss.rows[0]);
      }
    });
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
  res.json({ message: "OK" });

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
  res.json({ message: "OK" });

});

app.get("/calendar", async (req, res) => {

  await clientManihino.query(sql_calendar(req.query), (err, ress) => {
    if (err) {
      console.log(err);
      return;
    }

    const ttt = ress.rows.reduce((res, item) => {
      return {
        ...res,
        [item.ddate]: {cnt: item.cnt}
      };
    }, {});

    res.status(200);
    res.json(ttt);


  });
});

app.get("/playsDetailed", async (req, res) => {

  await clientManihino.query(sql_playsDetailed(req.query), (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }

    ttt = Object.entries(resss.rows.reduce((res, curItem) => {

      let foundItem = res[curItem.ddate]?.find((item) => item.playId === curItem.play_id);
      if (foundItem) {
        foundItem =
          {...foundItem,
           results: [...foundItem.results.filter((item) => item.playerId !== curItem.player_id),
                      {
                        playerId: curItem.player_id,
                        score: curItem.score,
                        winner: curItem.winner,
                      }
                    ]
          };
      } else {
        foundItem = {
          playId: curItem.play_id,
          gameId: curItem.game_id,
          gameName: curItem.game_name,
          counts: curItem.counts,
          comment: curItem.comment,
          results: [
            {
              playerId: curItem.player_id,
              score: curItem.score,
              winner: curItem.winner,
            }
          ]
        }
      }


      return {...res,
        [curItem.ddate]: [...res[curItem.ddate]?.filter((item) => item.playId !== curItem.play_id) || [],
                          foundItem
                         ]
        };

    }, {})).map((item) => {
      return {
        ddate: new Date(item[0]),
        plays: item[1].map((item) => ({
          ...item,
          results: item.results.sort((a,b) => a.playerId > b.playerId ? 1 : -1)
        }))
      }
    }).sort( (a, b) => a.ddate > b.ddate ? 1 : -1);

    res.status(200);
    res.json(ttt);

  });
});

app.get("/games", async (req, res) => {
  await clientManihino.query(sql_games, (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    res.status(200);
    res.json(resss.rows);
  });
});

app.get("/locations", async (req, res) => {
  await clientKeklog.query("select id, name from locations order by name", (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    res.status(200);
    res.json(resss.rows);
  });
});

app.get("/allSeasons", async (req, res) => {
  await clientManihino.query(`select distinct date_part('year', ddate) ddate from play order by ddate desc`,
    (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    res.status(200);
    res.json(resss.rows.map(item => item.ddate));
  });
});



app.get("/players", async (req, res) => {
  await clientManihino.query(sql_players, (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    res.status(200);
    res.json(resss.rows);
  });
});

app.get("/rating", async (req, res) => {

  await clientManihino.query(sql_rating(req.query), (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }

    ttt = Object.values(resss.rows.reduce((result, curItem, curIndex, arr) => {
      return {
        ...result,
        [curItem.game_id]: {
          gameId: curItem.game_id,
          cnt: curItem.cnt,
          gameName: curItem.game_name,
          results: [
            ...(result[curItem.game_id]?.results || []),
            {
              playerId: curItem.player_id,
              playerName: curItem.player_name,
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
