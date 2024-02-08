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


const sql_players = `select players.id id, players.name "name", users.ava ava from players join users on users.player = players.id`;
const sql_games = `select id, name from games`;

const sql_rating = (season, userId) => `
WITH unreads AS (select games.id game_id,
       SUM(case when 
       coalesce(comm_notification.last_read_comm_id, 0) <> coalesce((select MAX(id) from comm where comm.play_id = play.id), 0) 
                and ${userId ? userId : "null"} is not null
                then 1 else 0 end) cnt
  from games
       join play on play.game = games.id
	   left outer join comm_notification on comm_notification.play_id = play.id and
	                   comm_notification.user_id = ${userId ? userId : "null"}
 where ${userId ? userId : "null"} is not null and
       play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)
group by games.id)
select 
   games.id                  game_id,
   games.name                game_name,
   COUNT(distinct play.id)   cnt,
   players.id                player_id,
   players.name              player_name,
   COUNT(play_detail.play)   wins,
   COALESCE(unreads.cnt, 0)  unreads	 
from
   play
   join games on play.game = games.id
   left outer join unreads on unreads.game_id = games.id
   cross join players
   left outer join play_detail on play_detail.play = play.id and
                                  play_detail.player = players.id and
                                  play_detail.winner = TRUE and
                                  play.counts = TRUE
 where play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)                         
group by games.id, game_name, player_id, player_name, unreads.cnt`;

const sql_calendar = ({season}) => `
select cast(play.ddate as char(10)) ddate,
       count(*) cnt
  from play 
 where play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)
 group by play.ddate
`;

const sql_playsDetailed = (season = null, gameId = null, ddate = null, userId = null) => `
WITH unreads AS (
  select play.id play_id,
      (select coalesce(MAX(1), 0) from comm where play_id = play.id) comm_exist,
       case when coalesce(comm_notification.last_read_comm_id, 0) <> coalesce((select MAX(id) from comm where play_id = play.id), 0)
            and ${userId ? userId : "null"} is not null
            then 1 else 0 end unread_flag            
  from play
 left outer join comm_notification on comm_notification.play_id = play.id and
                comm_notification.user_id = ${userId ? userId : "null"}
where (play.ddate between make_date(${season}, 1, 1) and make_date(${season}, 12, 31)
       or ${season} is null) and
      (play.game = ${gameId} or ${gameId} is null) and
      (play.ddate = ${ddate} or ${ddate} is null)
)  
select play.id play_id, 
       cast(play.ddate as char(10)) ddate,
       play.counts counts,
       play.comment "comment",
       play.game game_id,
       games.name game_name,
       play_detail.player player_id,
       play_detail.score score,
       play_detail.winner winner,
       coalesce(unreads.unread_flag, 0) unreads,
       coalesce(unreads.comm_exist, 0) comm_exist    
 from play
      join games on play.game = games.id
      left outer join play_detail on play.id = play_detail.play
      left outer join unreads on unreads.play_id = play.id
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

  // iтf (/\/login.*/.test(req.url)) {
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

const host = 'localhost';
//const host = '193.124.112.79';

const clientManihino = new Client({
  user: 'mback',
  host,
  database: 'manihino',
  password: 'postgres',
  port: 5432,
});

const clientKeklog = new Client({
  user: 'postgres',
  host,
  database: 'keklog',
  password: 'postgres',
  port: 5432,
});

const clientRunchall = new Client({
  user: 'postgres',
  host,
  database: 'runchall',
  password: 'postgres',
  port: 5432,
});

clientManihino.connect(); //Нужно наверное статус подключения проверять при запросе
//clientKeklog.connect();
//clientRunchall.connect();


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

app.post("/manihino-login", async (req, res) => {

  await clientManihino.query(
          `select users.id, players.name 
             from users join players on players.id = users.player 
            where users.login = '${req.body.login}' and users.pass = '${req.body.password}'`, (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }

     if (resss.rows.length === 1) {
       res.status(200);
       res.json({ token: jwt.sign({ id: resss.rows[0].id }, JWT_SECRET, { expiresIn: `1d` }) })
     } else {

     }

   });
});

app.get("/manihino-user-current", async (req, res) => {

  const decoded = jwt.decode(req.headers.authorization);

  await clientManihino.query(
    `select players.id "playersId",
            players.name "playersName",
            users.ava "ava"
       from users join players on players.id = users.player 
            where users.id = ${decoded.id}`, (err, resss) => {
      if (err) {
        console.error(err);
        return;
      }

      res.status(200);
      res.json({id: resss.rows[0].playersId, loginName: resss.rows[0].playersName, ava: resss.rows[0].ava});


    });
})

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

app.post("/markCommAsRead", async (req, res) => {

  const decoded = jwt.decode(req.headers.authorization);
  try {
    await clientManihino.query(`delete from comm_notification where play_id=${req.body.playId} and user_id=${decoded.id}`);
    await clientManihino.query(
      `insert into comm_notification (play_id, user_id, last_read_comm_id)
           select ${req.body.playId}, ${decoded.id}, (select max(id) from comm where play_id = ${req.body.playId})
          `);
    res.status(200);
    res.json({ message: "OK" });
  } catch (err) {
    console.log(err);
  }

});

app.post("/addCommentary", async (req, res) => {
  const decoded = jwt.decode(req.headers.authorization);
  try {
    const res1 = await clientManihino.query(
      `select last_read_comm_id comm_id from comm_notification where play_id = ${req.body.playId} and user_id = ${decoded.id}`
    );
    const res2 = await clientManihino.query(
      `select id comm_id from comm where play_id = ${req.body.playId} order by ddate desc limit 1`
    );
    const query =
      `insert into comm(id, play_id, user_id, ddate, text)
       select nextval('comm_id'), ${req.body.playId}, ${decoded.id}, now(), '${req.body.text}' RETURNING *`;
    const res3 = await clientManihino.query(query);

    if (!res2.rows.length || res1.rows[0].comm_id === res2.rows[0].comm_id) {
      await clientManihino.query(`delete from comm_notification where play_id=${req.body.playId} and user_id=${decoded.id}`);
      await clientManihino.query(
        `insert into comm_notification (play_id, user_id, last_read_comm_id)
           select ${req.body.playId}, ${decoded.id}, ${res3.rows[0].id}
          `);
    }
    res.status(200);
    res.json(res3.rows[0]);

  } catch (err) {
    console.log(err);
  }


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

  const decoded = jwt.decode(req.headers.authorization);

  await clientManihino.query(sql_playsDetailed(req.query.season, req.query.gameId, req.query.ddate, decoded?.id), (err, resss) => {
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
          commExist: curItem.comm_exist,
          unreads: +curItem.unreads,
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

app.get("/commentary", async (req,res) => {
  const decoded = jwt.decode(req.headers.authorization);

  await clientManihino.query(
    `select comm.ddate "ddate",
            players.id "playerId",
            players.name "playerName",
	          comm.text "commText",
	          case when comm_notification.play_id is not null then 1 else 0 end "lastReadFlag"         
       from comm
            join users on comm.user_id = users.id
	          join players on users.player = players.id
	          left outer join comm_notification on comm_notification.play_id = comm.play_id and
	                                               comm_notification.user_id = ${decoded ? decoded.id : "null"} and
	                                               comm_notification.last_read_comm_id = comm.id
	    where comm.play_id = ${req.query.playId}      
   order by comm.ddate`, (err, resss) => {
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
  await clientManihino.query(`select distinct date_part('year', ddate) ddate from play union select date_part('year', NOW()) order by 1 desc`,
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
  const decoded = jwt.decode(req.headers.authorization);

  await clientManihino.query(sql_rating(req.query.season, decoded?.id), (err, resss) => {
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
          unreads: +curItem.unreads,
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


app.get("/runchall", async (req, res) => {
  await clientRunchall.query("select * from run order by ddate, id", (err, resss) => {
    if (err) {
      console.error(err);
      return;
    }
    res.status(200);
    res.json(resss.rows);
  });
});


app.post("/addRun", async (req, res) => {

  console.log(req.body);

  await clientRunchall.query(
    `insert into run (id, name, ddate, distance, durationsec, walkintervalsec, runintervalsec, vrunkmsec, temperature, comment)
     select nextval('run_id'),
           '${req.body.name}', 
           '${req.body.ddate}',
           '${req.body.distance}',
           '${req.body.durationsec}',
           '${req.body.walkintervalsec}',
           '${req.body.runintervalsec}',
           '${req.body.vrunkmsec}',           
           '${req.body.temperature}',           
           '${req.body.comment}'          
     RETURNING *;`,
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

app.listen(port, () => {
  console.log("listening sample message");
});
