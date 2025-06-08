# Quoridor

Quoridor is an easy to play, fun game! At first it seems very simple, but there is some deep underlying strategy involved. Try to beat the bots I designed!

## Overview

The objective of the game is to reach the other side of the board first. You can do so by moving one square at a time in the cardinal directions. The opponent has the same goal. 


Players have the ability to jump over other players if they are adjacent.


Each side starts with 10 fences, which go between tiles and are 2 tiles long. Tiles block paths for both players, and must be gone around. You cannot completely block either players path to the end. 


One can place one tile, or make one move each turn


This is the jist of the game, but the rules can be found on the site as well.

## Bot Design

There are two weaker bots, bot 0 was used for testing, and bot 1 was an earlier iteration. Bot 2 is the main bot. It follows a simple logic order to determine which move it will play. 

### 1. Opening
For the first 2 moves at the beginning of the game 75% of the time it will randomly chooses from 8 basic openings (movement only), 25% of the time it will skip an opening. This was added to induce more variety into games and add a level of interest. 

### 2. Win If Possible
The next priority is if there is a guaranteed win in the next move, the bot will make that move.

### 3. Aggresive Fence Placement
The bot checks all potential fence placements, and if a fence would extend the players shortest path by 3 or more, it will place that fence. If there are multiple options more than 3, it will choose the one that increases the players shortest path the most.

### 4. Defensive Fence Placement
If the player is within 3 tiles of the goal AND 4 moves away from winning, the bot will place a defensive fence. Primarily this is a fence directly infront of the player, but if this is not possible, the bot will place a fence to the side of the player as well, boxing them in.

### 5. Best Move
The best move decision is where much of the complexity comes from. Each tile has a weight associated with it, default of 1 for every square. To improve decision making and avoid being boxed in penalties are added to specific tiles:


0 tiles away from walls (adjacent): Penalty = +0.1

1 tiles away from walls: Penalty = +.05

2 tiles away from walls: Penalty = +.03

3 tiles away from walls: Penalty = +.01

1 tile away from player: Penalty = +.1


Using these tile weights as edge weights, and with tiles seperated by fences having their edges removed, dijkstras algorithm is ran. And the bot will choose the next move in the shortest path.


This calculation is also used to determine player proximity to goal, and how much a fence placement will increase the players path. 

### 6. Random Move Fallback
If the bot finds no move that satisfies any of these priority conditions (this should never happen, but just in case), the bot will make a random move.


## Future Improvements

A couple of considerations I had for improving this project in the future included:


Making a pass and play mode

Using evolution to further improve bots

Forward thinking in decision making

Online play


## How I Made It
This was my first attempt using Cursor to almost single handedly complete a project. Most of the code was written by Cursor. At first, I attempted making very broad requests and seeing what the output would be, but this resulted in something I was not looking for almost every single time. I made sure that Cursor was writing code in an object oriented manner, and directed every step along the way, with very clear direction of what I wanted it to produce, and how I wanted the code to be organized. I would then review and test the code before moving on. The project took roughly 30 hours to complete, but the bulk of the work not including finicky tweaks took less than 8 (Bot 1 was the computer at this time, but additional improvements were made as well as upgrading to Bot 2). I had multiple play testers (friends & fam) test along the way to try to figure out where the bot was falling short and what improvements I could make. Initially, I was interested in an evolutionary approach, but after attempting both this, and a forward thinking approach (letting the bot calculate a move in advance), these were way slower than I hoped. I may revisit these in the future, but for now I am quite satisfied with the result.

To play, just click the website link to my github pages Quoridor page

See if you can beat it!
