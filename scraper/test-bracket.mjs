// Unit-style test of the bracket math, running in node against the built modules.
import { emptyFlight, setWinner, describeMatches, entryStanding, aggregate } from '../app/src/lib/bracket.js';
import { leaderboard } from '../app/src/lib/stats.js';
import { TEAMS } from '../app/src/data/teams.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  } else {
    console.log('  ok:', msg);
  }
}

// Build a 1S flight where the 9 entries are filled with one team per position.
let f = emptyFlight('1S');
const teamIds = TEAMS.map(t => t.id);
f = {
  ...f,
  entries: f.entries.map((e, i) => ({ ...e, teamId: teamIds[i], seed: i + 1, name: `P${i+1}` })),
};

// --- Scenario 1: nothing played ---
console.log('Scenario: empty flight');
let s = entryStanding(f, 0);
assert(s.wins === 0 && s.maxRemaining === 3 && s.alive, 'pos 0 starts with 3 potential wins');
s = entryStanding(f, 7);
assert(s.wins === 0 && s.maxRemaining === 4 && s.alive, 'pos 7 starts with 4 potential wins (play-in)');

// --- Scenario 2: pos 0 (Rochester) wins out, full path ---
console.log('Scenario: pos 0 wins flight outright');
f = setWinner(f, 'PI', 'top');   // pos 7 wins play-in (advances 7 into QF1 vs pos 0)
f = setWinner(f, 'QF1', 'top');  // pos 0 wins QF1
f = setWinner(f, 'QF2', 'top');  // pos 3 wins QF2
f = setWinner(f, 'QF3', 'top');  // pos 2 wins QF3
f = setWinner(f, 'QF4', 'top');  // pos 1 wins QF4
f = setWinner(f, 'SF1', 'top');  // pos 0 wins SF1 (over QF2 winner = pos 3)
f = setWinner(f, 'SF2', 'top');  // pos 2 wins SF2
f = setWinner(f, 'F',   'top');  // pos 0 wins F (over SF2 winner = pos 2)

s = entryStanding(f, 0);
assert(s.wins === 3 && s.maxRemaining === 0 && s.alive, 'pos 0 champion has 3 wins, no remaining, alive');
s = entryStanding(f, 7);
assert(s.wins === 1 && !s.alive, 'pos 7 won play-in then lost QF (1 win, eliminated)');
s = entryStanding(f, 8);
assert(s.wins === 0 && !s.alive, 'pos 8 lost play-in (0 wins, eliminated)');
s = entryStanding(f, 2);
assert(s.wins === 2 && !s.alive, 'pos 2 lost the final (2 wins, eliminated)');
s = entryStanding(f, 3);
assert(s.wins === 1 && !s.alive, 'pos 3 lost SF (1 win, eliminated)');
s = entryStanding(f, 4);
assert(s.wins === 0 && !s.alive, 'pos 4 lost QF (0 wins, eliminated)');

// Total wins across the flight = 1 + 4 + 2 + 1 = 8
const agg = aggregate([f, emptyFlight('2S'), emptyFlight('3S'), emptyFlight('4S'),
                       emptyFlight('1D'), emptyFlight('2D'), emptyFlight('3D'), emptyFlight('4D')]);
const totalPts = Object.values(agg.points).reduce((a, b) => a + b, 0);
assert(totalPts === 8, `total wins across 1S = 8 (got ${totalPts})`);

// --- Scenario 3: leaderboard sanity ---
console.log('Scenario: leaderboard');
const lb = leaderboard([f, emptyFlight('2S'), emptyFlight('3S'), emptyFlight('4S'),
                        emptyFlight('1D'), emptyFlight('2D'), emptyFlight('3D'), emptyFlight('4D')]);
const first = lb[0];
assert(first.team.id === teamIds[0], `rank 1 is the team at pos 0 (${first.team.id})`);
assert(first.points === 3, `rank 1 has 3 pts (${first.points})`);
assert(first.maxPossible === 3, `rank 1 max = 3 (nothing else to play)`);
assert(first.eliminated18 === true, `rank 1 with no other entries can't reach 18`);
// They have only 3 pts in 1S and no entries elsewhere. So max possible = 3, not 18.

// --- Scenario 4: undo via setting winner null clears downstream ---
console.log('Scenario: undo a final clears downstream and points');
const f2 = setWinner(f, 'F', null);
const lb2 = leaderboard([f2, emptyFlight('2S'), emptyFlight('3S'), emptyFlight('4S'),
                         emptyFlight('1D'), emptyFlight('2D'), emptyFlight('3D'), emptyFlight('4D')]);
const teamAtPos0 = lb2.find(r => r.team.id === teamIds[0]);
assert(teamAtPos0.points === 2, `clearing F drops pos 0 to 2 pts (was 3) — got ${teamAtPos0.points}`);
assert(teamAtPos0.alive === 1, 'pos 0 is alive again because final isn\'t decided');

// --- Scenario 5: undo a QF clears subsequent SF and F ---
console.log('Scenario: undo a QF cascades through SF and F');
let f3 = setWinner(f, 'QF1', null);
const m = describeMatches(f3);
const sf1 = m.find(x => x.id === 'SF1');
const ff = m.find(x => x.id === 'F');
assert(sf1.winner == null, 'SF1 winner is cleared');
assert(ff.winner == null, 'F winner is cleared');

console.log('\nAll bracket math tests pass.');
