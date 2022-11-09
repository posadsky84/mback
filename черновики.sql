select
   play.id             play_id,
   games.id            game_id,
   games.name          game_name,
   play.ddate          ddate,
   players.id          player_id,
   players.name        player_name,
   play_detail.score   score,
   play_detail.winner  winner
  from
   play
   join games on play.game = games.id
   cross join players
   left outer join play_detail on play_detail.play = play.id and
                                  play_detail.player = players.id
order by












//удолить
async function returnPlayers (ret)  {

  console.log("pssssss..1.........");


  console.log("pssssss..2.........");
  const qry = "select * from players";

  client.query(qry, (err, res) => {
    console.log("pssssss..3.........");
    if (err) {
      console.log("ПИЗДЕЦ!!");
      console.error(err);
      return;
    }

    console.log("hello...........");
    console.log("before ret: " + JSON.stringify(res.rows));
    ret = JSON.stringify(res.rows);



  })

};
