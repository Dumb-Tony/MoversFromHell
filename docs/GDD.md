
MOVERS FROM HELL
MASTER GAME DESIGN DOCUMENT
A 1-4 player physics-driven moving-company co-op game
NORTH-STAR QUESTION  Is physically moving furniture with friends, packing a truck, driving it, and unloading it inherently fun enough to build a full game around?
Design Bible / Build Specification / Living Document
Version 1.0  |  17 August 2026  |  PC-first

CONTENTS
Update this field in Word to generate page numbers.

# Document Authority and Product Snapshot
This document is the master design and implementation authority for Movers From Hell. It translates the agreed concept into buildable systems, explicit boundaries, tunable data, acceptance criteria, and a staged roadmap suitable for Claude or another implementation agent. If a later idea conflicts with this document, preserve the four pillars and the validated core loop; record intentional changes in a revision log.
Field
 | Locked decision

Genre
 | Cooperative physics logistics / friendslop moving-company game

Players
 | 1-4; co-op is the intended experience; solo supported where practical

Primary platform
 | PC, eventual Steam release

Final presentation
 | Third-person 3D with keyboard/mouse and controller parity

Initial implementation
 | Standalone HTML/browser gameplay prototype and vertical slice

Core loop
 | Accept → assess → prepare → carry → pack → secure → drive → unload → place → invoice

Business fantasy
 | Turn a terrible garage operation into a surprisingly legitimate moving company

Primary failure
 | Losing money and reputation; hard mission failure is rare

Design mantra
 | Simple controls + systemic physics = complex situations


NON-NEGOTIABLE PLATFORM STRATEGY  The browser build is a rapid gameplay laboratory, not the final technical foundation. After the core loop is proven fun and playable, the project is intended to be rebuilt or transitioned into a real 3D Unity PC game for eventual Steam release.
## Status Language
LOCKED: central identity; change only with an explicit product decision.
TARGET: desired production behavior; temporary simplification is acceptable if the learning goal survives.
PROTOTYPE: required for the first standalone browser vertical slice.
EXPANSION HOOK: preserve an extension seam, but do not build now.
## Product Promise
A player sees an ordinary moving problem, proposes a questionable physical solution, persuades friends to help, and lives with whatever happens. The game supplies readable objects, forces, architecture, tools, and economic consequences. The players supply the plan, coordination, blame, recovery, and joke.

# 1. Vision, Audience, and Experience Goals
## 1.1 High Concept
Movers From Hell is a PC-first cooperative game in which one to four friends operate a moving company. Every meaningful object must be physically assessed, carried, maneuvered through architecture, loaded into a real cargo space, secured, transported, unloaded, and placed. Nothing important disappears into a menu inventory. The rules create credible logistics; player decisions create the comedy.
## 1.2 Intended Audience
Friends who enjoy highly shareable co-op chaos, problem solving, and physical comedy.
Players who like readable systems with room for mastery rather than opaque simulation.
Solo players who enjoy efficiency puzzles and self-imposed optimization.
Streamers and spectators who benefit from clear causes, visible consequences, and short story arcs.
PC players who expect mouse/keyboard support, full controller support, scalable settings, online invitations, and replayable sessions.
## 1.3 Experience Goals
Immediate: walking, aiming, gripping, and carrying a box should feel responsive within minutes.
Social: a large object should create useful communication without canned synchronization prompts.
Strategic: a crew should form a route, tool, packing, and unloading plan from world geometry.
Consequential: mistakes should cost time and money, damage objects, or create a new physical problem without constantly ending the job.
Comedic: the funniest events should be caused by comprehensible player choices and physical escalation.
Masterable: experienced crews should become visibly better movers, then encounter new contracts that make them improvise again.
Replayable: the same contract should support materially different routes, pack plans, optional goals, and outcomes.
## 1.4 Emotional Arc of a Contract
Beat
 | Desired feeling
 | Systemic cause

Arrival
 | Confident curiosity
 | Readable manifest, visible building puzzle, parking choice

First carry
 | Physical discovery
 | Weight, grip position, doorway clearance

Escalation
 | Communication under pressure
 | Large objects, hazards, shortcuts, imperfect teamwork

Truck pack
 | Collective strategy
 | Finite volume, mass distribution, protection, unload order

Drive
 | Suspense and payoff
 | Cargo inertia reveals preparation quality

Unload
 | Relief or self-inflicted pain
 | Packing order becomes retrieval order

Invoice
 | Laughter, blame, pride
 | Detailed accounting and event recap


## 1.5 Four Design Pillars
### Physical Logistics
Objects do not disappear into inventories. Shape, mass, grip, clearance, balance, cargo volume, support, restraint, and inertia are the gameplay.
### Creative Problem Solving
Buildings are puzzles without a single approved solution. Removing a door, using a dolly, lowering from a balcony, or brute-forcing a hallway can all be valid attempts when physically plausible.
### Consequential Chaos
Mistakes create new states rather than frequent resets. A damaged couch is still cargo. A broken box spills contents. A poor pack becomes a dangerous drive. Consequences must be understandable, priced, and often funny.
### Company Progression
Contracts fund better vehicles, equipment, and headquarters. Mechanical progression adds physical options. Equally important, players learn to move, pack, and coordinate more effectively.
# 2. Design Laws and Scope Guardrails
CORE PHILOSOPHY  Physics → interaction → cooperation → consequences → content. Do not solve an unproven interaction by adding more maps, furniture, progression, or jokes.
## 2.1 The Game Should Rarely Say No
If an action looks physically possible, allow the attempt unless it breaks level containment, safety settings, or network integrity. Prefer yes, with consequences.
Allow awkward solo dragging of objects intended for two players.
Allow unsafe stacking, riding in cargo, removing doors, and questionable routes where the authored level supports them.
Show why an attempt struggles: insufficient leverage, obstruction, anchor overload, grip loss, or damage.
Reserve invisible locks for out-of-bounds containment, unavailable contract areas, and technical safeguards.
Do not require one designer-approved solution when multiple physical solutions are legible.
## 2.2 Failure Becomes State
A dropped object is now somewhere inconvenient.
A broken item still needs delivery, either as a damaged whole or tracked pieces.
A burst box spills contents that must be recovered or reboxed.
Overtime increases labor and vehicle cost; work continues.
An extra trip costs fuel and time; work continues.
A traffic violation costs money; the route continues.
A catastrophic blockage offers state-safe recovery after a grace period, preserving damage and applying a service fee.
The general economic failure is the company lost money on the job, not an arbitrary full-screen reset.
## 2.3 Time Is Money
Contracts use estimates, cost thresholds, and customer expectations instead of aggressive universal countdowns. Elapsed time increases labor, vehicle, parking, satisfaction, and overtime costs. Crossing an estimate triggers a warning, not automatic failure. This keeps pressure while allowing players to spend several hilarious minutes trying a terrible idea.
## 2.4 Explicit Non-Goals
Do not add
 | Reason

Hunger, thirst, sleep, or injury treatment
 | Dilutes physical logistics with survival chores

Resource harvesting or deep crafting trees
 | Tools are purchased, rented, or unlocked

Employee spreadsheet simulation
 | Players are the movers

Deep character stats or RPG builds
 | Skill should primarily live in player knowledge

Aggressive countdowns on every job
 | Stops experimentation and converts cost pressure into arcade failure

Vehicle racing focus
 | Driving tests the pack; it is not a separate racing game

Scripted gag dependence
 | Comedy should emerge from systems

Many currencies
 | Use cash, reputation, and contract goals

Combat or criminal escalation
 | Not part of the moving-company fantasy

Content volume before feel
 | More props cannot fix unsatisfying carrying


# 3. Core Contract Loop
## 3.1 Complete Loop
Accept a contract with payout, estimate, distance, item profile, hazards, and customer constraints.
Choose a vehicle and physically load tools at HQ, or use a streamlined loadout during the prototype.
Arrive and park; read access geometry and objective markers.
Assess valuable, fragile, awkward, disassemblable, and heavy items.
Prepare routes with doors, blankets, sliders, ramps, dollies, and straps.
Carry, drag, roll, rotate, and coordinate objects through the pickup location.
Pack the truck as a finite physical volume, considering mass distribution and unload order.
Secure cargo to anchors; close the ramp and cargo door.
Drive a short route whose forces reveal packing quality.
Unload and deliver objects to room-sized destination zones; assemble where required.
Receive an itemized invoice, grade, reputation result, customer review, and memorable-event recap.
## 3.2 Contract Rhythm Targets
Contract tier
 | Target duration
 | Stops
 | Primary complexity

Intro
 | 12-20 minutes
 | Pickup + destination
 | Basic carrying and truck packing

Standard
 | 20-35 minutes
 | 1-2 pickups + destination
 | Architecture, fragile mix, preparation

Complex
 | 30-50 minutes
 | Multiple floors/stops
 | Equipment selection, unload order, hazards

Spectacle
 | 25-45 minutes
 | Special site
 | One exceptional logistical problem


These are production targets, not prototype commitments. Avoid padding. A contract should end soon after its logistical idea has paid off.
## 3.3 Preparation Versus Brute Force
Every substantial obstacle should support at least two approaches: a lower-risk prepared method and a faster or funnier brute-force method. Preparation costs time now but reduces handling effort and damage later. Brute force must remain possible enough to tempt players.
## 3.4 Contract Phase State Machine
Phase
 | Entry
 | Exit validation

Briefing
 | Contract selected
 | Loadout confirmed

Pickup
 | Crew arrives
 | Required cargo loaded or crew elects another trip

Secure
 | Cargo threshold satisfied
 | Ramp/door closed; warnings acknowledged

Transit
 | Driver departs
 | Destination reached

Delivery
 | Cargo door opened
 | Required items settled in valid destination zones

Settlement
 | Manifest validated
 | Invoice accepted and progression saved


A phase may return to an earlier phase for an extra trip. The state machine must not lose damage, time, fees, or manifest status.
# 4. Camera and Controls
## 4.1 Camera
The intended final experience uses a shoulder-height third-person camera with adjustable distance, collision avoidance, and generous aim assistance for hand targeting. It must preserve awareness of the player, both hand targets, object orientation, architecture, teammates, ramps, and vehicles. Indoors it should compress smoothly rather than cut unpredictably. An optional first-person camera is an expansion hook; the game is designed around third person.
## 4.2 Keyboard and Mouse Default
Input
 | On foot
 | While driving

WASD
 | Move
 | Steer / throttle / brake mapping

Mouse
 | Camera and target point
 | Camera / look

Left mouse
 | Hold/release left-hand grip
 | Horn or contextual action

Right mouse
 | Hold/release right-hand grip
 | Look back / alternate action

Space
 | Jump, mantle, assisted climb
 | Handbrake

Shift
 | Sprint when free; brace/exert while gripping
 | Accelerate

Ctrl / S
 | Crouch or controlled lower
 | Brake / reverse

E
 | Use, interact, tool, vehicle seat
 | Exit when stopped

Q
 | Context rotate, toss, or cancel
 | Cargo status glance

R
 | Recover eligible held item/player
 | Reset vehicle only when stuck


## 4.3 Controller Default
Input
 | Action

Left stick
 | Move / steer

Right stick
 | Camera / aim

LT / RT
 | Left / right hand grab

A / Cross
 | Jump / mantle / confirm

X / Square
 | Interact / use tool

B / Circle
 | Drop, cancel, controlled toss

LB
 | Brace / exert modifier

RB
 | Context rotation / secondary tool action

D-pad
 | Tool quick select and communication pings

Menu
 | Pause / contract view


## 4.4 Control Principles
Press-and-hold grip is the default; releasing releases that hand. Toggle grip is an accessibility option.
Aim selects a surface point, not merely a glowing canned handle, with gentle target stabilization.
One input should not change meaning invisibly. Context changes require prompt and reticle feedback.
Every essential action requires controller parity and remapping.
Walking remains responsive; physics influences the player most strongly under external force.
The challenge comes from difficult objects in difficult spaces, not deliberately hostile controls.
# 5. Player Locomotion and Physical Character
## 5.1 Hybrid Character Model
Use a responsive locomotion controller coupled to a physical reaction layer. A player capsule or motor owns normal navigation. External impulses, carried mass, grip forces, slopes, impacts, and loss of footing feed stumble or ragdoll states. Recovery is fast and readable. The player should not wrestle the avatar merely to cross a room.
State
 | Entry
 | Behavior
 | Exit

Grounded
 | Stable support
 | Responsive movement and facing
 | Jump, impact, grip force

Braced
 | Exert while gripping
 | Lower speed; higher grip and impulse resistance
 | Release exert or grip

Stumbling
 | Imbalance threshold
 | Reduced control; procedural recovery
 | Balance restores or threshold exceeded

Ragdoll
 | Major impact/fall
 | Physical body; limited crawl/grab
 | Auto or player recovery in 1-3 seconds

Pinned
 | Body constrained by object
 | Callout; grab/recover possible
 | Object moved or safe unstuck

Climbing
 | Mantle affordance
 | Short assisted motion
 | Top reached or canceled


## 5.2 Exertion Without a Stamina Chore
Exert is a leverage and stability modifier, not a survival stamina bar. Sustained overload may reduce maximum force and add tremble, strain audio, or grip slip, but recovery is rapid. Heavy work should motivate a partner or tool, not idle waiting.
## 5.3 Player-to-Player Physicality
Players collide softly during normal locomotion and strongly when impact or held mass justifies it.
Players may grab another player's body or equipment using the common grip system where stable.
There is no dedicated sabotage button. Productive mechanics naturally permit irresponsible use.
Host options control teammate grab, departure readiness, cargo riders, friendly vehicle impacts, and recovery votes.
Being flattened, dragged, pinned, or knocked downstairs is short-lived and bloodless. Economic and logistical consequences provide the stakes.
# 6. Freeform Grabbing, Carrying, and Cooperation
## 6.1 Grip Acquisition
A ray or short cone from the camera chooses a reachable surface point. On grab, create a spring-like constraint from the selected hand target to the local point on the object's collider. Store the local-space coordinate so rotation and multiple grips remain consistent. Bias toward visible handles and stable regions without requiring authored sockets.
## 6.2 Grip Model
Factor
 | Effect

Object mass
 | Requires more force, accelerates slowly, pulls players harder

Distance from center of mass
 | More torque and rotation leverage, less translational stability

Hand count
 | Two hands improve control and sustainable load

Mover count
 | Forces add; opposing inputs can twist objects or drag teammates

Surface grip
 | Wet/slippery surfaces reduce sustainable constraint force

Brace state
 | Raises force cap and stability while reducing movement speed

Damage/handle state
 | Broken handles or weakened surfaces may release


## 6.3 Carry Tiers Are Guidance, Not Gates
Tier
 | Examples
 | Expected handling

Light
 | Box, lamp, chair
 | One player carries freely; some items tossable

Medium
 | Dresser, small table, TV
 | One player awkward; two stable

Heavy
 | Couch, refrigerator, washer
 | One drags or pivots; two or a tool preferred

Extreme
 | Piano, safe, marble statue
 | Team plus equipment; brute force remains possible


## 6.4 Cooperative Handling
Opposite-end grips naturally stabilize long objects.
Shared-object feedback exposes center of mass and stress only when players struggle.
Communication pings include rotate left/right, lift, lower, stop, clear route, and release on three.
When one player releases, forces update immediately; no canned synchronized carry animation takes ownership.
Additional movers help only when their force is useful. A third player can improve or worsen the maneuver.
Player force should be bounded so two clients cannot create an explosive feedback loop.
## 6.5 Accessibility Assists
Grip strength scaling, wider surface targeting, rotational damping, reduced fragile damage, optional two-hand mirroring, and cooperative alignment assist may reduce motor demand. They must preserve the physical puzzle rather than turn furniture into inventory icons.
# 7. Physics and Object Property Model
## 7.1 Object Definition
Every movable entity uses a data-driven definition plus runtime state. The visible silhouette and collider must agree closely because spatial reasoning is the game. Use exaggerated, stable mass tuning rather than literal kilograms when realism harms feel.
Property
 | Purpose
 | Example

id / prefab
 | Stable definition and asset identity
 | couch_3seat_01

massClass / mass
 | Handling force and vehicle load
 | heavy / 90 tuned units

dimensions
 | Clearance and packing metadata
 | 2.1 × 0.9 × 0.85 m

centerOfMassOffset
 | Balance and leverage
 | local x/y/z

friction / restitution
 | Sliding and bounce
 | 0.65 / 0.05

fragility
 | Damage thresholds
 | sturdy / normal / fragile / extreme

replacementValue
 | Economic consequence
 | $900

surfaceTags
 | Tool and weather interactions
 | fabric / glass / wood

disassembly
 | Removable parts and required tool
 | four legs / screwdriver

destination
 | Required room or zone
 | living_room

cargoHints
 | Optional tutorial cues
 | heavy-low / fragile-protect


## 7.2 Runtime State
Transform, velocity, sleep state, current grips, strap constraints, support contacts.
Condition 0-100, cosmetic damage, structural break state, detached parts.
Authority/owner metadata, last stable transform, out-of-bounds timer.
Wetness, blanket coverage, tool mounting, container contents, cargo-zone membership.
Objective identity, pickup state, loaded state, trip ID, destination state.
## 7.3 Stability Rules
Use fixed-step physics and cap maximum impulse, angular velocity, and constraint correction.
Prefer compound convex colliders; use detailed mesh collision mainly for static architecture.
Tune carried-object collision to prevent hand jitter without allowing wall ghosting.
Sleep settled cargo; wake on truck acceleration, collision, grip, strap change, or relevant impact.
Use continuous collision only for fast or high-value objects where tunneling is visible.
Use a last-stable transform for recoverable entities.
Aggregate repeated scrape contacts into one coherent damage event.
## 7.4 Breakage
Breakage uses authored logical states rather than uncontrolled procedural mesh destruction. A table may lose legs, a box may open and spawn contents, and a couch may split at a seam. Every broken state must remain movable and completable. The prototype may use condition bands and only one or two breakable object types.
# 8. Architecture, Routes, and Property Damage
## 8.1 Architecture as Puzzle
Doors, corners, stairs, rails, windows, balconies, elevators, gates, slopes, and parking define the route puzzle.
Critical clearances must be visually legible. Decorative collision must not contradict the visible surface.
Standard contracts offer at least one reliable route and may offer risky alternates.
No standard job should require an obscure exploit.
Park position should affect ramp angle and carry distance without causing unwinnable setup.
## 8.2 Modifiable Environment
Element
 | Possible action
 | Tradeoff

Door
 | Open or remove from hinges
 | Preparation time and replacement risk

Furniture legs
 | Unscrew and reattach
 | Smaller profile; loose parts to track

Railing
 | Remove authored sections
 | Better clearance; high damage penalty

Window
 | Open/remove where authored
 | Alternate route; glass/fall risk

Floors and walls
 | Protect with blankets/runners
 | Tool time and limited supply


## 8.3 Damage Model
Static surfaces define material, durability, impact threshold, repair category, and maximum charge. Contact energy above threshold accumulates damage. Show decals, dents, cracks, broken components, sound, particles, haptics, and one consolidated cost ticker. Repeated minor contact needs cooldown and aggregation so a scrape is priced coherently.
Furniture condition uses thresholds such as Perfect → Scratched → Chipped/Cracked → Broken/Destroyed. Economic loss should scale with replacement value and actual condition change. A fragile television and a cheap box should not share a generic hit-point curve.
## 8.4 Damage Feedback and Ledger
At impact: material sound, visual mark, optional haptic pulse, and one small cost notice.
During work: optional running damage total and manifest condition icons.
At invoice: object/location, category, condition change, repair or replacement cost, and player attribution when reliable.
Attribution exists for humor and learning; shared company result remains primary.
Hard fail is never triggered solely by generic damage.
EXPANSION HOOK  Repair and cover-up tools—spackle, paint, glue, screws, or duct tape—may later reduce charges at the cost of time and uncertain customer detection. Do not implement them in the first prototype.
# 9. Tools and Physical Preparation
## 9.1 Tool Rule
Tools create new physical solutions; they do not erase physics. Each tool changes leverage, friction, protection, clearance, containment, or securing. Better tools should introduce both new mastery and new accidents.
Tool
 | Primary function
 | Failure/comedy mode
 | Prototype

Flat dolly
 | Roll heavy items on level ground
 | Runs on slopes; load slips
 | Required

Moving blanket
 | Reduce scratches/impact
 | Bad wrap obscures grip or falls off
 | Required or simplified

Ratchet strap
 | Restrain cargo to anchors
 | Poor angle or tension permits shift
 | Required

Ramp
 | Bridge truck floor height
 | Misalignment or steep approach
 | Required

Screwdriver/drill
 | Disassemble authored parts
 | Loose pieces get lost
 | One required

Furniture sliders
 | Reduce floor friction
 | Object keeps sliding
 | Later

Appliance dolly
 | Secure tall heavy objects
 | Tips during fast turns
 | Later

Piano board
 | Stabilize piano
 | Demands good strap geometry
 | Expansion

Winch
 | Pull along a line
 | Snap or bad redirect
 | Expansion

Forklift/crane
 | Handle extreme contracts
 | Vehicle-scale accidents
 | Late expansion


## 9.2 Interaction Contract
Tools are world objects and consume cargo space unless mounted.
Deploy, attach, tension, fold, and retrieve through the common interaction system.
Placement provides a readable preview and valid/invalid affordance.
Tools have stable IDs and state so multiplayer authority and save snapshots can represent them.
Lost tools incur retrieval or replacement cost; the prototype may auto-return them after scoring.
## 9.3 Physical Preparation at HQ
In production, players should select contracts, choose trucks, take equipment from racks, load tools, board, and depart physically when pacing supports it. Headquarters evolves from a terrible garage into a real company. A quick-load option remains available after novelty fades. The first browser prototype uses a compact loadout screen or nearby tool rack.
# 10. Truck Packing and Securing
## 10.1 Differentiator
The cargo box is a real collision-enabled space with floor, walls, roof, ramp, door, and anchor points. Nothing teleports into storage. Packing is cooperative 3D Tetris with meaningful volume, mass distribution, protection, access order, and restraint.
## 10.2 Cargo Rules
Required objects count as loaded only after crossing the cargo threshold and settling inside the closed volume.
Support contacts and friction determine stacks; general furniture does not snap to a grid.
Heavy-low, fragile-protected, stable-base, and unload-order strategies emerge from consequences.
Players may ride in cargo when lobby and contract settings permit.
A closed door contains objects but does not prevent movement or damage.
Tools share volume with customer cargo.
The system tracks which trip moved each item.
## 10.3 Straps
A strap connects two eligible endpoints: cargo-to-anchor in the prototype and potentially cargo-to-cargo later. The player selects endpoint A, aims or walks to endpoint B, confirms, and tensions. Render the line, anchor validity, tension, and overload risk.
Strap state
 | Meaning
 | Feedback

Slack
 | Length exceeds separation; little restraint
 | Sagging line, gray state

Tensioned
 | Useful restraint within rating
 | Straight line, teal state, ratchet clicks

Overstressed
 | Force approaches rating
 | Orange/red pulse, creak, vibration

Failed
 | Anchor, strap, or surface gives way
 | Snap sound and released cargo


## 10.4 Pack Quality
Outcomes derive from physical contacts, velocity, damage, and constraints during transport. A heuristic may estimate unsecured mass and imbalance for warnings and scoring, but it must not secretly damage items without a physical cause.
## 10.5 Cargo Optimization
Stable sleeping cargo may use a lower-cost simulation mode after the door closes.
Browser driving may use truck-local simulation or force proxies if full moving-world physics is unstable.
Wake objects near players, under high acceleration, after collision, or when straps change.
Never freeze cargo so completely that the drive stops testing the pack.
# 11. Vehicles and Driving
## 11.1 Role
Driving is the final exam for packing, not a racing minigame. Prototype travel lasts roughly one to three minutes; production routes generally last two to five. Controls are forgiving and the road provides a few meaningful force events.
## 11.2 Box Truck Behavior
Arcade-accessible steering with readable body roll, braking distance, and wide turns.
Acceleration, braking, cornering, grade, bumps, and collisions affect cargo.
Poor balance modestly affects steering and braking without becoming a punishing simulator.
Cab seats are safe. Cargo riding and exterior clinging are optional risky behaviors with recovery safeguards.
Driver can glance at a coarse cargo-status indicator; perfect information is unnecessary.
## 11.3 Route Hazards
Hazard
 | Packing test
 | Availability

Hard brake
 | Forward restraint and stack stability
 | Prototype required

Sharp turn
 | Lateral restraint and tall-item tipping
 | Prototype required

Speed bump/pothole
 | Vertical bounce and protection
 | One prototype event

Steep hill
 | Longitudinal shift and vehicle power
 | Production

Low clearance
 | Vehicle choice and roof mistakes
 | Expansion

Rain/snow
 | Traction, braking, exterior handling
 | Expansion


## 11.4 Vehicle Progression
Rented van: cheap and agile, very limited volume.
Small box truck: baseline vehicle and first prototype truck.
Large/extended box truck: fewer trips, harder access and packing discipline.
Liftgate truck: safer heavy loading, slower setup, mechanical hazards.
Specialty heavy-haul: late contracts and oversized cargo.
# 12. Mission and Contract Structure
## 12.1 Contract Definition
Field
 | Use

Identity
 | Name, customer archetype, tier, seed, unlock requirements

Sites
 | Pickup(s), destination(s), allowed areas, parking zones

Manifest
 | Required objects, destination zones, special handling

Economy
 | Payout, estimate, labor rate, fuel, damage liability

Constraints
 | No wall damage, one trip, elevator booking, noise

Hazards
 | Traffic, stairs, weather, pets, fragile architecture

Optional goals
 | Under estimate, one trip, no breakage, room accuracy

Flavor
 | Brief, customer notes, review vocabulary


## 12.2 Rare Hard Fails
All required objects are irrecoverably destroyed and the contract explicitly requires intact delivery.
Truck or players leave containment and safe recovery is impossible.
A special legal or safety condition explicitly states immediate termination; use sparingly and telegraph it.
The host ends the session.
Otherwise use recovery, partial completion, extra cost, negative profit, or a humiliating review.
## 12.3 Destination Placement
An object counts as delivered when substantially inside the correct room/zone and settled below velocity thresholds for a dwell time. Standard contracts do not require pixel-perfect rotation. Assembly or exact placement appears only when requested clearly and supported mechanically.
# 13. Initial Standalone Browser Vertical Slice
PROTOTYPE MANDATE  Build one complete, replayable contract. The browser version exists to answer whether the central moving loop is fun. It is a proof of concept and gameplay laboratory, not the final production codebase.
## 13.1 Required Scenario
Element
 | Prototype requirement

Pickup
 | One compact suburban house with 2-3 rooms, a doorway turn, short steps/porch, driveway, and optional garage

Destination
 | One smaller site with 3-4 labeled room zones

Vehicle
 | One small box truck with physical cargo box, rear door, ramp, 4-8 anchors, and drivable route

Objects
 | Roughly 15-25: boxes, chair, lamp, table, TV, dresser, mattress, couch, appliance, and showcase heavy/fragile item

Tools
 | Flat dolly, protection/blanket, straps, ramp, and one disassembly tool

Loop
 | Load, pack, secure, close, drive, unload, place, invoice

Players
 | One fully supported; multiplayer-ready architecture where practical; optional second local/test actor


## 13.2 Suggested Object Manifest
Category
 | Count
 | Purpose

Cardboard boxes
 | 6-10
 | Fast handling, stacking, burst/damage test

Small furniture
 | 3-5
 | One-player carrying and awkward silhouettes

Medium furniture
 | 3-4
 | Two-hand control and doorway clearance

Large furniture
 | 2-3
 | Co-op/dragging and route planning

Fragile/high value
 | 1-2
 | Protection, careful packing, economic stakes

Showcase object
 | 1
 | Couch, fridge, or upright piano challenge


## 13.3 Prototype Route
Use a short contained street or scene transition with a drivable segment. Include one hard brake, one meaningful turn, and one bump so preparation produces visible consequences. Exclude traffic AI, open-world navigation, police, fuel management, weather, and multiple vehicles.
## 13.4 Prototype Simplifications
Stylized primitive or low-detail 3D meshes are acceptable; collision-faithful proportions are mandatory.
Use authored condition stages and decals, not procedural destruction.
Use a compact job-start screen rather than a full headquarters.
Persistent progression may be only a saved best invoice, cash, and reputation stub.
Build a deterministic or host-authoritative session seam, but do not delay feel tests for production networking.
No accounts, matchmaking, backend, cloud saves, monetization, split-screen, workshop, or user-generated content.
No more contracts until the first is demonstrably worth replaying.
## 13.5 Prototype Success Decision
Proceed toward full production only if repeated external playtests show that carrying, route solving, packing, driving consequences, unloading, and the invoice create voluntary replay and memorable stories. A feature-complete prototype that is not fun is a failed prototype and should be revised, not expanded.
# 14. Multiplayer and Social Interaction
## 14.1 Production Target
Online cooperative play for one to four players, with Steam invitations, lobbies, reconnect, and drop-in/drop-out where contract state permits. Local split-screen and mixed local/online are expansion hooks until proven feasible.
## 14.2 Authority Model
Host/server owns contract state, dynamic rigid bodies, straps, damage, vehicles, and scoring.
Clients predict local locomotion and hand targets, then reconcile gently.
Grip requests include object, local contact point, hand, timestamp, and client pose; host validates reach.
Shared objects accept forces from all validated grips; no single client permanently owns a jointly held object.
Interest management uses site, room, cargo zone, and sleeping state.
Damage and invoice events are host-authored and idempotent.
## 14.3 Join, Leave, Recovery
Late join spawns safely after receiving a state snapshot.
A leaving player releases grips, exits seats, and leaves no hidden ownership.
Reconnect restores identity, cosmetics, and contribution statistics, not unsafe attachment.
Host migration is desirable after the core online loop is stable, not a prototype blocker.
## 14.4 Communication and Anti-Grief
Voice chat is a production target with mute/report controls; proximity voice is an expansion hook.
Ping wheel: lift, lower, rotate, stop, clear route, fragile, strap, ready to drive.
Character barks communicate strain and danger without masking speech.
Lobby settings govern teammate grab, cargo riders, departure lock, friendly vehicle impacts, and recovery vote.
Shared company profit stays primary; per-player numbers support comedy and learning rather than competition.
# 15. Scoring, Economy, and Customer Response
## 15.1 Invoice Formula
Profit = base contract + bonuses + tips − labor time − overtime − vehicle/fuel − property damage − item damage − violations − recovery/service fees.
Reputation is separate and uses timeliness, completion, damage ratio, special constraints, and customer tolerance.
Line item
 | Purpose
 | Prototype behavior

Base contract
 | Rewards completion and scope
 | Fixed value

Efficiency bonus
 | Rewards finishing under estimate
 | Graduated; no hard cutoff

One-trip bonus
 | Rewards packing skill
 | Awarded if all required cargo moved once

Room accuracy
 | Rewards correct unloading
 | Required; small perfect bonus

Property damage
 | Prices wall/window/fixture harm
 | Immediate ticker and itemization

Furniture damage
 | Prices condition loss by value
 | Condition bands and break state

Labor/overtime
 | Makes time economically meaningful
 | Per-minute cost and overtime multiplier

Traffic/vehicle
 | Prices route mistakes
 | Collision fee and optional violations


## 15.2 Grade and Customer Review
The letter grade summarizes the invoice but never hides it. Use profit margin, delivered completeness, damage ratio, and constraints rather than speed alone. Negative profit still completes the job.
Customer reviews assemble from actual event tags, outcome, and customer personality. Example tags include front_door_removed, mover_in_refrigerator, piano_safe, stairs_destroyed, extra_trip, and cargo_rider. Use curated templates for control and localization. Select only the two or three most salient events.
## 15.3 Contribution Statistics
Show lighthearted stats after the shared result: distance carried, heavy-object assist time, straps placed, items delivered, damage involvement, falls, recoveries, and unusual achievements. Avoid rewarding selfish handling or deliberate damage.
# 16. Company, HQ, Vehicle, and Equipment Progression
## 16.1 Progression Loop
Complete contracts → earn cash and reputation → unlock tiers → purchase tools/vehicles/HQ upgrades → attempt harder logistics. Cash buys capability and presentation. Reputation unlocks trust and unusual customers. Avoid percentage-heavy skill trees.
## 16.2 Headquarters Tiers
Tier
 | Space
 | Visible progression
 | Mechanical unlock

Garage
 | Cramped starter bay
 | Hand-painted sign and borrowed racks
 | One truck, basic tools

Bad warehouse
 | Larger dirty unit
 | Job board, lockers, repair corner
 | More vehicles and loadouts

Legitimate depot
 | Organized yard and office
 | Awards, reviews, branded fleet
 | Special tools/contracts

Regional operation
 | Multiple bays and showroom
 | Statistics wall and odd trophies
 | Heavy-haul spectacle jobs


## 16.3 Upgrade Philosophy
Horizontal before vertical: a liftgate changes procedure; +5% strength does not.
Vehicles trade capacity against access, cost, and handling.
Tools remain visible and physically stored where practical.
Cosmetics express crew identity without advantage.
Statistics turn failures into history: windows broken, pianos dropped, total damage, customers satisfied.
A disastrous job may lose money, but the campaign must avoid unrecoverable bankruptcy spirals.
Recovery options include low-risk contracts, equipment rental, or a comically unfavorable bailout job.
# 17. Locations and Increasingly Ridiculous Contracts
## 17.1 Early Game
Small apartment: corners, elevator etiquette, limited parking.
Suburban house: doors, porch, driveway, basic truck pack.
Student dorm: many boxes, narrow halls, cheap fragile furniture.
Garage cleanout: classification and volume.
Small office: chairs, desks, electronics, disassembly.
## 17.2 Midgame
Three-story townhouse, high-rise, restaurant, storage facility, large office, old Victorian house, and luxury penthouse add stairs, balconies, elevators, long carries, expensive finishes, mixed stops, and specialized tools.
## 17.3 Late Game
Museum relocation: priceless awkward artifacts and strict condition requirements.
Aquarium or zoo facility: tanks, habitat equipment, wet routes; living animals remain out of scope unless safely designed.
Arcade or movie studio: unusual silhouettes, wheeled props, dense cables.
Laboratory or server room: high value and sensitive handling.
Celebrity mansion or antique collector: enormous payout and terrifying replacement values.
Government facility: procedural constraints and mysterious oversized equipment without combat.
## 17.4 Signature Patterns
Pattern
 | Systemic identity

Grand Piano
 | Extreme mass, wheels, value, stairs, preparation

Hoarder House
 | Volume, occlusion, unstable stacks, sticker discovery

High-Rise
 | Elevator volume/weight, booking cost, lobby route

Balcony Solution
 | Vertical route, lowering gear, wind and fall risk

One-Trip Challenge
 | Cargo volume and unloading-order mastery

Storm Move
 | Wet boxes, slippery ramps, mattress wind load


# 18. Hazards, Emergent Comedy, and Recovery
## 18.1 Comedy Rules
Cause must be legible.
Escalate through wobble → warning → failure → new problem, allowing reaction.
Preserve agency during disaster: grab, brace, warn, rescue, or make it worse.
Prefer short recovery and persistent consequences over long incapacitation.
Let physics, camera, sound, and invoice deliver the joke.
## 18.2 Hazard Catalog
Hazard
 | Effect
 | Counterplay

Stairs
 | Acceleration, tipping, falling movers
 | Team carry, dolly, strap, controlled lower

Rain
 | Low grip, weak cardboard, slick ramp
 | Covers, blankets, slower handling

Wind
 | Broad objects become sails
 | More movers, edge-on orientation, straps

Elevator overload
 | Slow or stall state
 | Split load, fewer people, stairs

Pets/bystanders
 | Dynamic obstruction
 | Pause, contain, alternate route

Potholes
 | Vertical cargo impulse
 | Slow down, protect, secure

Fragile floors/rails
 | Damage and changed route
 | Distribute load, prepare


## 18.3 Recovery
Track a last-stable transform for players, critical cargo, tools, and vehicle. If an entity stays out of bounds, inverted, pinned, or without meaningful progress for a grace period, offer recovery. Release unsafe constraints, preserve damage, place at a designated node, and apply a documented fee where appropriate.
# 19. Replayability and Mastery
## 19.1 Replay Sources
Small physical variation and team coordination.
Route choices, parking, preparation, and brute force.
Packing strategy, protection, straps, and unloading order.
Optional goals and company economics.
Manifest, weather, constraint, and hazard variants.
Player-authored challenges such as one trip, no tools, low damage, or maximum chaos.
## 19.2 Player Skill Progression
The deepest progression is learned competence: pivoting a couch, judging center of mass, staging a route, choosing a dolly, packing heavy-low, protecting fragile items, and communicating. Later content should periodically invalidate habits with new geometry or objects.
## 19.3 Procedural Limits
Prefer curated spaces with parameterized manifests over fully procedural houses. Spatial puzzles require intentional clearances, sightlines, recovery nodes, and alternate routes. Randomize objects, room assignments, weather, and constraints only after solvability validation.
EXPANSION HOOK  Community contracts or Steam Workshop may later serialize layouts, manifests, zones, hazards, and goals. Preserve a versioned contract schema, but do not build an editor before the internal content pipeline is stable.
# 20. Art, Animation, VFX, and Audio Direction
## 20.1 Art
Use stylized realism: readable proportions, chunky silhouettes, bright lighting, exaggerated response, and clear geometry. Furniture must look real enough for intuitive weight and clearance judgments. Avoid decorative clutter that contradicts collision.
## 20.2 Visual Hierarchy
Interactable objects use restrained edge/material response, not permanent neon.
Objective tags appear through clutter only when useful.
Fragility/value use labels, materials, icons, and optional outlines.
Strap mode provides high-contrast endpoint and tension feedback.
Damage appears where contact occurred.
## 20.3 Animation
Procedural hands/IK reach grip points.
Carry pose responds to load, direction, grip height, and partner force.
Stumble/ragdoll blends into fast recovery.
Body and face exaggerate strain and surprise without requiring dialogue.
Basic locomotion remains readable and responsive.
## 20.4 Audio
Layer
 | Purpose

Material impacts
 | Mass, surface, damage severity, cargo event

Constraints
 | Grip creak, strap ratchet, dolly rattle, scrape

Character barks
 | Strain, warning, relief, pinned state

Vehicle
 | Engine load, suspension, cargo thumps, braking

Music
 | Light adaptive work rhythm; makes room for physical drama

Invoice stingers
 | Celebrate profit and underline shocking deductions


Prototype visuals are diagnostic: simple meshes, color separation, contact shadows, and faithful collision. Production asset density must never compromise physics readability or frame rate.
# 21. UI, UX, Onboarding, and Accessibility
## 21.1 HUD
Small center reticle with left/right grip state.
Contract phase and compact objective count at screen edge.
Contextual tool, strap, destination, and vehicle feedback.
Optional elapsed time, running cost, damage total, and network status.
No persistent panel should cover the object-doorway relationship.
## 21.2 Contract UX
Brief shows payout, estimate, distance, manifest profile, access notes, hazards, and optional goals.
Manifest filters by room/category and shows pickup, loaded, delivered, and condition states.
Invoice animates major lines, then exposes a complete static breakdown.
Event recap uses actual logged events.
A retry keeps settings and optionally preserves loadout.
## 21.3 Onboarding Sequence
Walk, camera, jump, and recover in the driveway.
Carry one box with two hands.
Move a chair through a doorway and learn leverage.
Use a dolly on a dresser or appliance.
Coordinate or simulate a second grip on a large object.
Pack heavy and fragile objects; place one strap.
Drive through turn, brake, and bump; observe cargo.
Unload to room zones and read the invoice.
## 21.4 Accessibility Baseline
Area
 | Requirement

Input
 | Full remapping, hold/toggle grip, sensitivity/deadzone, invert axes

Motor
 | Grip strength, aim magnetism, rotation damping, simplified strap placement

Vision
 | Scalable UI, high contrast, colorblind-safe icon/text redundancy

Hearing
 | Subtitles with speaker/direction, visual alerts, volume categories

Cognition
 | Solo pause, objective history, optional hints, reduced HUD

Motion
 | Camera shake, FOV/distance, motion blur off, head-bob off

Difficulty
 | Damage, time-cost pressure, driving assist, player collision settings


# 22. Browser Prototype Technical Architecture
## 22.1 Intent
Use a standalone HTML entry point with modular JavaScript or TypeScript and WebGL/WebGPU rendering. Select a mature browser 3D/physics stack for iteration speed. Separate game rules and data from renderer/input glue where useful, but do not over-engineer for direct Unity conversion.
## 22.2 Module Boundaries
Module
 | Responsibilities

App/State
 | Boot, transitions, pause, contract phases, save stub

Input
 | Action map, keyboard/controller, rebinding-ready prompts

Player
 | Motor, camera, hands, grips, exert, stumble/recover

Physics
 | Fixed step, materials, collisions, constraints, sleep/wake

Objects
 | Definitions, state, damage, disassembly, containers

Tools
 | Dolly, blanket/protection, strap, ramp, disassembly

Vehicle/Cargo
 | Truck controller, cargo zone, road forces

Contract
 | Manifest, zones, timers/costs, completion, invoice

UI/Audio
 | HUD, prompts, settings, feedback, event presentation

Session seam
 | Player IDs, commands/events, authority hooks, snapshots


## 22.3 Fixed-Step Loop
Collect actions and update desired player/hand targets.
Advance fixed physics steps with a capped accumulator.
Resolve grip/tool constraints and collision events.
Aggregate damage, cargo, zone, and contract changes.
Interpolate transforms for rendering; update camera and UI.
Record a lightweight event log for scoring and debugging.
## 22.4 Multiplayer-Ready Where Practical
Even if the first build is single-player, use stable player IDs, serializable contract state, explicit commands/events, and no hidden singleton ownership of objects. Separate authoritative rules from presentation. Do not build a backend, matchmaking, or production rollback before the physical loop is validated.
## 22.5 Performance and Debugging
Target stable 60 FPS at 1080p; minimum playtest floor 45 FPS with 25 objects.
Sleep settled bodies, pool transient effects, cap fragments, simplify distant collision.
Developer overlay: FPS, physics time, bodies, constraints, contacts, and network seam.
Debug views: colliders, center of mass, grip points, forces, velocity, damage, zones.
Controls: spawn/reset, friction/mass presets, road events, cargo force, teleport, snapshot.
Export event log and invoice inputs for reproducible reports.
# 23. Data Structures and Events
## 23.1 Object Definition
Key
 | Type
 | Notes

id
 | string
 | Stable unique definition

prefab
 | string
 | Scene/render asset reference

massClass
 | enum
 | light / medium / heavy / extreme

mass
 | number
 | Tuned simulation units

dimensions
 | vec3
 | Packing and validation metadata

physics
 | object
 | friction, restitution, damping, center of mass

damage
 | object
 | thresholds, value, break states, material

grip
 | object
 | force cap, surface rules, preferred regions

disassembly
 | array
 | part, tool, time, reversible

tags
 | string[]
 | fragile, container, appliance, glass, quest


## 23.2 Contract Runtime
contractId, seed, phase, elapsedWorkSeconds, estimateSeconds, overtimeTier.
Manifest entries with spawnedEntityId, count, condition requirement, trip, destinationZoneId, state.
Property and item damage ledgers, fees, bonuses, event log, recovery count.
VehicleId, tripCount, route progress, cargo snapshot, players, settings.
## 23.3 Core Events
Event
 | Minimum payload

GripStarted/Ended
 | playerId, hand, entityId, localPoint, time

Impact
 | entities, point, impulse, materials, relative velocity

DamageApplied
 | target, source, category, amount, cost, position

StrapChanged
 | strapId, endpoints, tension, state, actor

ZoneChanged
 | entityId, zoneId, entered/exited, settled

CargoState
 | entityId, truckId, secured, support, risk

RoadForce
 | truckId, type, vector, severity

Recovery
 | entityId, reason, fee, old/new transform

ContractPhase
 | from, to, time, validation result


## 23.4 Save Data
Prototype save: settings, best invoice, cash, reputation, and unlock stub. Production save: company progression, equipment, fleet, HQ, cosmetics, history, statistics, and versioned migrations. Do not persist a live rigid-body graph as the only campaign truth.
# 24. Transition to Full 3D Unity Production
LOCKED STRATEGY  Transition only after the game is fun, not merely after it contains enough features. Rebuild systems properly in Unity using prototype lessons. Do not force a direct port of browser code.
## 24.1 Evidence Required
Complete contract works without developer intervention.
External players understand grip/carry and form packing strategies.
Core interactions generate repeatable laughter without scripted disasters.
Packing changes transport outcomes predictably.
At least half of test groups voluntarily replay or ask for another contract.
Control confusion and unrecoverable physics bugs are not dominant feedback.
Team can identify essential rules and disposable prototype features.
## 24.2 Unity Production Targets
Third-person controller with physical reaction and procedural hand IK.
Robust rigid-body physics, constraints, collision layers, and break states.
Online 1-4 player authority, Steam invites/lobbies, reconnect, and interest management.
Full keyboard/mouse, controller, Steam Input consideration, and graphics/settings suite.
Content tools for contracts, manifests, zones, hazards, and review templates.
Persistent HQ/company, vehicle fleet, equipment, cosmetics, achievements, and statistics.
Production animation, lighting, audio, VFX, localization, accessibility, crash reporting, and save migration.
Potential split-screen and Workshop only after feasibility and launch priorities are clear.
## 24.3 What Transfers
Transfer
 | Do not assume transfer

Validated rules, tuning ranges, object taxonomy, contract concepts, UX flow, playtest evidence
 | Rendering code, physics constants, browser scene graph, network code, performance hacks, asset pipeline


## 24.4 Unity Architecture Direction
Use data assets for object/tool/contract definitions, prefab runtime entities, fixed physics cadence, input actions, an explicit contract state machine, authoritative multiplayer, and event-driven scoring. Keep presentation separate from durable rules. Build content validators early; incorrect colliders, zones, anchors, and manifests will dominate production bugs.
# 25. Claude-Oriented Implementation Roadmap
## 25.1 Operating Instructions for Claude
Work in thin increments ending in a playable browser build.
State the behavior hypothesis, files/modules touched, and checks before each increment.
After each increment, run automated checks, launch, exercise the path, and record limitations.
Keep tuning in named config/data rather than scattered literals.
Do not add content, progression, online services, or polish while the current gate fails.
Preserve user changes and avoid broad rewrites unless the implementation blocks the validated slice.
Maintain CHANGELOG, KNOWN_ISSUES, PLAYTEST_NOTES, and a short architecture map.
Favor instrumentation and reproducible test scenes over guessing at physics bugs.
## 25.2 Phase Roadmap
Phase
 | Build outcome
 | Gate

0. Scaffold
 | Standalone launch, scene, action map, debug overlay, fixed loop
 | Loads locally; stable frame/step

1. Movement
 | Third-person proxy, camera, jump/mantle, recover
 | Responsive indoors and on ramp

2. One box
 | Freeform two-hand grip, collision, carry/drop
 | Controllable; no wall ghosting

3. Heavy object
 | Mass, leverage, drag, brace, stumble
 | Weight legible without hard denial

4. Cooperative seam
 | Second actor/test harness or command model
 | Multiple grips combine predictably

5. House puzzle
 | Pickup, 15-25 objects, manifest and zones
 | All objects recoverable and movable

6. Tools
 | Dolly, protection, ramp, disassembly
 | Each solves a physical problem

7. Cargo
 | Interior, loading, stacks, anchors, straps
 | Secured pack remains stable

8. Drive
 | Route, turn/brake/bump, cargo coupling
 | Poor pack shifts or damages visibly

9. Destination
 | Unload, room zones, settled validation
 | Manifest completes reliably

10. Economy
 | Time, damage, bonuses, invoice, review
 | Ledger matches events

11. Playtest
 | Onboarding, settings, instrumentation, fixes
 | External groups complete and replay

12. Decision
 | Evidence report and Unity go/revise/stop
 | Fun proven, not feature count


## 25.3 Per-Phase Definition of Done
No console errors in the primary path.
Implemented actions work on keyboard/mouse and a standard controller.
Major edge cases have a reproducible test or documented fixture.
Tuning values are named and documented.
Clean contract reset works without reloading corrupted state.
Performance stays above the playtest floor.
A playtest note states what became more or less fun.
Known limitations are explicit and do not undermine the phase's learning goal.
# 26. Prototype Acceptance Criteria
## 26.1 End-to-End
A new player can start, complete, and replay the suburban contract without developer commands.
The contract has 15-25 movable objects tracked through pickup, truck, and destination.
Truck can be loaded, strapped, closed, driven, reopened, and unloaded.
Invoice reports payout, time cost, property damage, furniture damage, trips, and bonuses accurately.
## 26.2 Interaction Feel
One box can be acquired, carried with two hands, rotated through a door, dropped, and recovered without sustained jitter.
A couch-equivalent can be dragged solo and handled materially better with another grip/player/test actor.
Grip location changes torque and balance visibly.
Locomotion remains responsive while forces can pull, stumble, knock down, and pin.
No required object depends on a single pixel-perfect grip.
## 26.3 Truck and Cargo
Three different pack arrangements yield observably different turn, brake, and bump results.
A tensioned strap reduces relative motion and damage.
Unsecured tall/heavy cargo can tip or slide for visible reasons.
Settled cargo does not explode or jitter indefinitely.
Cargo membership and door validation cannot be fooled by an object barely touching the threshold.
## 26.4 Damage and Completion
Impacts above thresholds create condition feedback and one ledger entry.
Generic damage never automatically fails the contract.
Broken required cargo stays deliverable or becomes trackable pieces.
Stuck recovery preserves progress and consequences.
A severely unprofitable job can still reach settlement.
## 26.5 UX and Accessibility
Essential actions have visible prompts and both input mappings.
Grip toggle, sensitivity, camera shake, UI scale, subtitles, and color-independent cues exist.
Objective, cargo, destination, and invoice states are understandable without color alone.
Solo pause freezes relevant simulation safely.
## 26.6 Performance and Robustness
Target 60 FPS at 1080p and do not drop below 45 FPS on the reference desktop with the full manifest.
No unbounded growth in active bodies, logs, decals, or constraints over three runs.
Reset removes transient straps, grips, damage records, fragments, and route state.
Save/settings reject incompatible versions safely.
No common sequence produces an unrecoverable soft lock.
## 26.7 Fun Validation Gate
Signal
 | Minimum evidence before Unity commitment

Comprehension
 | Most players move a box and identify the next objective without coaching

Emergent story
 | Most groups recount an unscripted event afterward

Learning
 | Second run changes route, pack, tool, or coordination

Replay intent
 | At least half voluntarily replay or ask for more

Core preference
 | Carrying/packing/transport consequences rank highly

Friction
 | Control confusion and unrecoverable bugs are not dominant


# 27. Testing, Tuning, and Telemetry
## 27.1 Automated Tests
Schema validation for IDs, references, zones, values, parts, and anchors.
Invoice fixtures including negative profit and overtime boundaries.
Contract phase transitions and reset idempotence.
Settled detection, cargo threshold, strap endpoints, and recovery eligibility.
Serialization and save-version migration.
## 27.2 Physics Test Scenes
Box carry corridor.
Couch doorway pivot.
Staircase heavy-object descent.
Ramp and dolly ascent.
Truck brake/turn/bump rig with repeatable layouts.
Strap angle, tension, overload, and release matrix.
Material damage matrix at controlled impulses.
Worst-case 25-object pile with players and vehicle motion.
## 27.3 Playtest Questions
What did the team try that the game allowed or unexpectedly prevented?
When did weight and grip become understandable?
Did preparation feel like choice or chore?
Could players predict cargo shift and damage?
Was the invoice funny and useful or merely punitive?
Which moment would they tell a friend about?
Would they replay the same contract differently?
## 27.4 Telemetry
Prefer local event logs and explicit opt-in upload. Capture phase duration, grips, drops, recovery, damage, strap use, cargo motion, trips, completion, and restart. Never record voice chat. Logs must be human-readable and deletable.
## 27.5 High-Leverage Tuning
Player acceleration, rotation, grip spring/damping, force cap, brace multiplier, stumble thresholds.
Object mass, friction, angular damping, break thresholds, condition-to-cost curve.
Strap stiffness/damping/rating and anchor layout.
Truck acceleration, brake/turn forces, and road-event severity.
Time estimate, labor rate, damage aggregation, bonuses, and recovery fees.
# 28. Expansion Hooks — Not in the First Prototype
Hook
 | Seam to preserve
 | Trigger

Online co-op
 | Player IDs, commands/events, snapshots, authority
 | Core interaction stable

Split-screen
 | Multiple input users/cameras and UI ownership
 | Performance/UI feasible

Weather
 | Surface modifiers and hazard data
 | Base handling readable

Advanced tools
 | Tool interface and equipment registry
 | Basic tools prove depth

Repair/cover-up
 | Damage categories and reversible ledger
 | Damage economy fair

Multiple stops
 | Site list and phase sequence
 | One-stop pacing works

Community contracts
 | Serializable layout/contract schema
 | Content tools stable

Steam Workshop
 | Versioned packages and validation
 | Support/safety plan exists

Proximity voice
 | Positional channel abstraction
 | Moderation/accessibility ready

First-person camera
 | Camera-mode abstraction
 | Third person remains primary

AI helper mover
 | Common command/grip interface
 | Solo needs it after assists

Replay/photo mode
 | Event and transform capture hooks
 | Demand and budget justify


SCOPE RULE  An expansion hook is permission to leave a clean seam, not permission to implement the feature. Each addition must strengthen physical logistics, creative problem solving, consequential chaos, or company progression.
# 29. Build Rules, Glossary, and Decision Checklist
## 29.1 Build Rules
Make movement feel good before grabbing.
Make one box feel good before adding furniture variety.
Make one heavy shared object feel good before building missions.
Make architecture create choices before multiplying locations.
Make tools solve physical problems before adding upgrade tiers.
Make packing satisfying before expanding driving.
Make bad packing produce understandable consequences before increasing damage.
Make unloading and the invoice satisfying before campaign progression.
Make one contract worth replaying before producing content.
Rebuild in Unity only after fun is demonstrated.
## 29.2 Glossary
Term
 | Definition

Friendslop
 | Co-op play where simple shared systems produce chaos, stories, and affectionate blame

Grip
 | Constraint between a hand target and local point on a physical entity

Manifest
 | Authoritative list of required objects and delivery conditions

Cargo zone
 | Truck volume tracking loaded entities and optimization

Settled
 | Valid zone membership below velocity thresholds for a dwell

Road force
 | Acceleration event transferred from truck to cargo

Condition
 | Object quality state used for feedback and cost

Recovery
 | Safe reposition that preserves consequences and prevents lock

Vertical slice
 | One complete contract validating the core experience, not a miniature final game


## 29.3 Feature Decision Checklist
Which pillar does the feature strengthen?
Does it create a physical decision or merely more content/maintenance?
Can the result be understood from world behavior and feedback?
Does failure become a playable state rather than a reset?
Can 1-4 players use it with keyboard/mouse and controller parity?
Does it preserve player-authored solutions?
Is it prototype-required, Unity-production, or an expansion hook?
What measurable check demonstrates that it works and improves fun?
## 29.4 Final Product Statement
NORTH STAR  Movers From Hell succeeds when a couch, staircase, doorway, box truck, and a few friends reliably produce a story the designers did not script. The browser prototype proves that experience. The eventual Unity PC game expands it into a durable Steam co-op game without losing simple controls, physical freedom, economic consequences, and emergent comedy.
