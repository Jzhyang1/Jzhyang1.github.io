var score = 0;
var length = 3;
var numofGames = 0;
var moving_direction = "South"; var direction = "South"; var pending_direction = "South";
var intervalTime = 300;
var dead = true;

var squares_width = 20;
var squares_height = 20;

var square_width = 40;
var square_height = 40;

var grid;

var highscore = 0;


function can_go(initial, next) {
    let valid = ["NorthEast","SouthEast","NorthWest","SouthWest"];
    return valid.includes(initial+next) || valid.includes(next+initial);
}

function mainloop() {
    if(dead)
        return;

    // if(can_go(direction, pending_direction))
    //     direction = pending_direction;
    move();

    setTimeout(mainloop, intervalTime);
}

function update_direction() {
    if(direction != pending_direction && direction == moving_direction && can_go(moving_direction, pending_direction)) {
        direction = pending_direction;
    }
}

document.addEventListener("keydown", (event) => {
    let x = event.code;
    console.log(x)
    
    // New Game
    if(x == 'Space') {
        newgame()
    }

    switch(x) {
        case 'KeyW':
        case 'ArrowUp':
            pending_direction = "North";
            break;
        case 'KeyS':
        case 'ArrowDown':
            pending_direction = "South";
            break;
        case 'KeyD':
        case 'ArrowRight':
            pending_direction = "East";
            break;
        case 'KeyA':
        case 'ArrowLeft':
            pending_direction = "West";
            break;
    }
});

function update_board(){
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");
    
    for(let i = 0; i < squares_height; ++i) {
        for(let j = 0; j < squares_width; ++j) {
            if(grid[i][j] == "snake") {
                if(i == snake[0][0] && j == snake[0][1])
                    ctx.fillStyle = "#3dEF53";
                else
                    ctx.fillStyle = "#0ddd23";
            }
            else {
                if((i+j) % 2) 
                    ctx.fillStyle = "#3355EE";
                else 
                    ctx.fillStyle = "#6699EE";
            }
            ctx.fillRect(square_width*j, square_height*i, square_width, square_height);
            if(grid[i][j] == "apple")
                ctx.drawImage(document.getElementById("applereferenceimage"),square_width*j, square_height*i, square_width, square_height);
        }
    }
}


function die() {
    if(parseInt(document.getElementById("scorenumber").innerHTML) > highscore) {
        document.getElementById("highscorenumber").innerHTML = document.getElementById("scorenumber").innerHTML
        highscore = parseInt(document.getElementById("highscorenumber").innerHTML)
    }
    dead = true;
    document.getElementById('message').innerText = "SCORE " + score;
    document.getElementById('highscoremessage').innerText = "HIGH SCORE " + highscore;
    document.getElementById('messagebox').style.visibility = "visible";
}


function move() {
    let head = snake[0];
    switch(direction) {
        case "West":
            if (head[1]==0 || grid[head[0]][head[1]-1]=="snake") {
                die()
            }
            else snake.unshift([head[0], head[1]-1]);
            break;
        case "East":
            if (head[1]==squares_width-1 || grid[head[0]][head[1]+1]=="snake") {
                die()
            }
            else snake.unshift([head[0], head[1]+1]);
            break;
        case "North":
            if (head[0]==0 || grid[head[0]-1][head[1]]=="snake") {
                die()
            }
            else snake.unshift([head[0]-1, head[1]]);
            break;
        case "South":
            if (head[0]==squares_height-1 || grid[head[0]+1][head[1]]=="snake") {
                die()
            }
            else snake.unshift([head[0]+1, head[1]]);
            break;
    }
    let tail = snake.pop();
    grid[tail[0]][tail[1]] = "";
    
    head = snake[0];
    if (grid[head[0]][head[1]]=="apple") {
        snake.push(tail);
        grid[tail[0]][tail[1]] = "snake";
        score++;
        intervalTime*=0.98;
        
        document.getElementById("scorenumber").innerHTML = score;

        newApple();
    }
    grid[head[0]][head[1]] = "snake";

    moving_direction = direction;
    update_board();
}

function newApple() {
    let num1 = Math.floor(Math.random()*squares_width);
    let num2 = Math.floor(Math.random()*squares_height);
    let trials = 1000;
    while((grid[num1][num2] == "snake" || grid[num1][num2] == "apple") && trials) {
        num1 = Math.floor(Math.random()*squares_width);
        num2 = Math.floor(Math.random()*squares_height);
        --trials;
    }
    if(trials)
        grid[num1][num2] = "apple";
}