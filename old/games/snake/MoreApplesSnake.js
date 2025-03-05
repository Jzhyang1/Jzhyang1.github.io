document.addEventListener("DOMContentLoaded", ()=>{
    let btngen = document.getElementById('NewGame');
    btngen.addEventListener('click', (evt) => {
        newgame()
    });
    setInterval(update_direction, 5);
    newgame();
});

function newgame() {
    if(!dead)
        return;

    document.getElementById('messagebox').style.visibility = 'hidden';

    console.log("New Game")
    numofGames = numofGames+1;
    score = 0;
    length = 3;
    dead = false;
    direction = "South";
    pending_direction = "South";
    intervalTime = 200;
    document.getElementById("roundnumber").innerHTML = numofGames;
    document.getElementById("scorenumber").innerHTML = 0;

    grid = [];
    for(let i = 0; i < squares_height; i++) {
        let temp = [];
        for(let j = 0; j < squares_width; j++) {
            temp.push('');
        }
        grid[i] = temp;
    }

    snake = [[4, 9], [3, 9], [2, 9]]
    grid[2][9] = "snake";
    grid[3][9] = "snake";
    grid[4][9] = "snake";

    grid[15][9] = "apple";
    newApple();
    newApple();
    newApple();
    newApple();
    
    update_board();
    mainloop();
}
