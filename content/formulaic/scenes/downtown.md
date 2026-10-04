---
key: downtown
title: Downtown
slug: Eastbound → Downtown · 8:20 a.m.
act: 4
is_bottleneck: true
is_ending: true
reads_flags:
- gabriella_answer
- card
- office_choice
- lawyer_choice
map:
  x: 1
  y: 6
choices: []
variants:
- slot: name
  when: {}
  text: Dex
  priority: 0
- slot: name
  when:
    timeline: 2
  text: Jax
  priority: 10
- slot: name
  when:
    timeline: 3
  text: Rex
  priority: 10
- slot: name
  when:
    timeline: 4
  text: Max
  priority: 10
- slot: name
  when:
    timeline_gte: 5
  text: Lex
  priority: 5
- slot: early_for_ira
  when: {}
  text: ''
  priority: 0
- slot: early_for_ira
  when:
    lawyer_choice: plan
  text: It was 9:14. I was early for Ira by nearly five hours. The plan and the panic had the same address.
  priority: 10
- slot: early_for_ira
  when:
    lawyer_choice: later
  text: It was 9:14. Somewhere above me, in one of those towers, Ira was sitting with his paper, waiting for a call I had told him was coming.
  priority: 10
- slot: coord_card
  when: {}
  text: I looked at the plaza, the towers, the cameras, and had the strangest sense that someone had written this spot down for me a long time ago, and that I had been too busy to read it.
  priority: 0
- slot: coord_card
  when:
    card: took
  text: I took the white card out of my breast pocket. 34.0522, 118.2437. I did not need to look the numbers up. I was standing on them.
  priority: 10
- slot: coord_card
  when:
    card: refused
  text: Somebody had tried to tell me where I would end up. I had not wanted to know. I suspect the card was still lying on my limestone.
  priority: 10
- slot: coord_answer
  when: {}
  text: ''
  priority: 0
- slot: coord_answer
  when:
    gabriella_answer: truth
  text: I thought about Gabriella's hand on mine. It was the only thing all morning that had not happened before. I had told her I would call. I had not called.
  priority: 10
- slot: coord_answer
  when:
    gabriella_answer: lie
  text: Some part of me was already drafting the statement. I could feel the sentences lining up in good order. They were not mine. They were the family's. They were drainage pipe.
  priority: 10
- slot: coord_answer
  when:
    gabriella_answer: silent
  text: I thought about the phone face down on the marble, and about every room I had ever left without saying anything, and how quiet those rooms must have been afterward.
  priority: 10
- slot: coord_office
  when: {}
  text: ''
  priority: 0
- slot: coord_office
  when:
    office_choice: corrected
  text: I wondered whether Marcus had a daughter at UCLA, or whether Desmond had a daughter who was eleven, and whether either of them would tell her about me kindly.
  priority: 10
- slot: coord_office
  when:
    office_choice: waited
  text: I thought about Desmond, who used to be Marcus, and wondered who I used to be, and whether anyone had issued me a new name tag without telling me.
  priority: 10
- slot: coord_office
  when:
    office_choice: walked
  text: I thought about Desmond, who used to be Marcus, and wondered who I used to be, and whether anyone had issued me a new name tag without telling me.
  priority: 10
- slot: one_call
  when: {}
  text: |-
    She answered on the first ring. “Frank? Where are you? I'm looking at you. You're on the TV. Are you— is that you?”

    “It's me.”

    “Teodoro's in the kitchen crying. I've never seen him cry. I didn't know he could.”

    “Tell him the saucer was fine.”

    “What?”

    “Nothing. Tell him thank you.”

    She was quiet. Then she said, “Okay,” and I could hear that she was going to do it, right then, walk into the kitchen and tell him, and I was grateful in a way I had no system for.
  priority: 0
- slot: one_call
  when:
    gabriella_answer: truth
  text: |-
    She answered on the first ring.

    “I'm calling,” I said. “Actually calling.”

    “I know.” Her voice was strange, close and far away at once. “I can see you. Every channel has you. There's a helicopter shot of the car.”

    “Gabriella.”

    “Are you scared?”

    “Yes.”

    There was a pause. “Okay,” she said, in the same voice as in the kitchen. “Me too.”
  priority: 10
- slot: one_call
  when:
    gabriella_answer: lie
  text: |-
    She answered on the fourth ring. “Hi.”

    “Gabriella, listen. This is going to look bad, but I want you to know that—”

    I heard it. The voice. The good one, the one for senators. I stopped.

    “Sorry,” I said. “No. I don't know what's happening. I'm scared.”

    For a long moment she said nothing at all. Then: “Okay. Okay. That's— okay.”
  priority: 10
- slot: one_call
  when:
    gabriella_answer: silent
  text: |-
    It went to voicemail. Her greeting was old. She had recorded it years ago, and someone in the room had said something just as she finished, and you can hear her start to laugh before it cuts off. I had never noticed that. I must have heard it a hundred times.

    “It's me,” I said, after the tone. “I—”

    I did not have the rest of the sentence. I held the phone and let it record nothing for a while.
  priority: 10
---


## Gas

The G63 was at a quarter tank. I had not put gas in a car myself since 2009.

“You need gas,” {{name}} said.

“I know I need gas.”

“You're gonna need it. Just saying. Those guys have a lot of gas.”

I pulled into a station on Vermont. The pump would not take my card, and it would not take the other card, and when I tried the black one, which is made of titanium and weighs about as much as a cookie, the little screen thanked me for my patience and showed me the weather. It occurred to me, later than it should have, that Harold Brenner did not need a board vote to call a bank.

“There's a place,” {{name}} said, and pointed across Vermont. “They buy stuff.”

## Pawn

The sign said GOLD · LOANS · CASH 4 ANYTHING, and under it, in smaller letters someone had added later with a different brush, NO GUNS. A bell rang when I opened the door, an actual bell on a curl of spring steel, the kind I had assumed survived only in films about small towns.

The man behind the glass was eating sunflower seeds and spitting the shells into a paper cup with great accuracy. He did not look at the television in the corner, which was showing my face, and I decided not to point it out.

I took off my watch. My father gave it to me on my eighteenth birthday. It came by courier, because he was in Geneva, with a card that said *Congratulations*, signed by his secretary, who had beautiful handwriting. I had worn it every day for twenty-five years. I had never once thought of it as something that could be sold, the same way you do not think of your own hand as something that could be sold.

He put a loupe in his eye and looked at it for a long time.

“Papers?”

“No.”

“Nineteen hundred.”

I heard myself say “Twenty-four” in the voice I use for acquisitions. He said “Nineteen” in the voice he used for everyone. He was right, and we both knew it, and I nodded.

He counted nineteen hundred-dollar bills onto the glass, twice, licking his thumb, and slid them under the window with a yellow ticket. “Thirty days,” he said. “After that it's mine.”

“That's fine.”

I folded the bills around the ticket and put them in my breast pocket. I had not carried cash since boarding school. It felt like carrying a small, warm animal that might at any moment want something.

{{name}} was leaning on the car when I came out. “Good?”

“Nineteen hundred dollars.”

He whistled. “That's a lot of gas.”

## Pump Four

The clerk was a woman in her sixties with reading glasses on a beaded chain. A small television behind her was showing my face. She did not look at it.

“Pump?” she said.

“Four. Sixty dollars, please. And—” I looked back at the car. He was in the passenger seat, waving at me. “And an apple, if you have one.”

“Bananas,” she said, and pointed. “No apples. Sorry, hon.”

I gave her one of the hundreds. She held it up to the light, which no one had ever done to me, and I stood there being checked, and found that I did not mind.

“You want your receipt?”

“No. Yes. Yes, please.”

She tore it off and gave it to me with the change. “Okay. Have a good one.”

I was in there for about two minutes. Nobody in that store knew who I was, or cared, and I have rarely in my life been happier. I still have the receipt. It is in my breast pocket with the other things.

## What Do You Do

Back on the road, he peeled the banana and ate it in about four bites. So he could eat. I found that I had been wondering.

“Can I ask you something?” he said. “What would you be doing right now? If none of this was happening.”

“I'd be in Morning Ops.”

“What's that?”

“A meeting. Ruth reads the numbers.”

“What numbers?”

I opened my mouth, and nothing was in it. I had sat through Morning Ops perhaps two thousand times. I could not remember a single number Ruth had ever read. I could tell you who sat where.

“Logistics,” I said.

“Cool,” he said. He meant it, or he was very good. “My dad was into logistics. Kind of. He drove a truck.”

“Where?”

He thought about it. Then he frowned, as if he had reached for something on a shelf and found the shelf wasn't there.

“Huh,” he said. “I don't actually know.”

He looked out the window for a while after that. He didn't say anything else about it, and I didn't ask. We passed a car wash where two men in yellow rain suits were washing a car by hand, carefully, as if it belonged to somebody they loved.

## News Radio

He changed the station and landed on news. A man with a calm, warm voice was saying my name.

“—Gaas, forty-three, whose company's software manages container traffic at dozens of ports worldwide. In a statement released about twenty minutes ago, Gaas Dynamics said it is, quote, cooperating fully with federal authorities and has placed the executive on administrative leave, effective immediately. The statement was signed by chief financial officer Harold Brenner. Traffic on the 710 remains—”

He turned it off.

“Administrative leave,” I said.

“Is that bad?”

“It's my company.”

“Huh,” he said. “Can they do that?”

I thought about the bylaws, which I had approved, and the board, which I had chosen, and the clause about conduct that Ira had once called “boilerplate, don't worry about it.”

“Yes,” I said.

## Echo Park

We went through Echo Park because he asked me to. “Go left here. No, here. Okay, slow down.”

He pointed at a stucco apartment building, pink once, with a fire escape and a lemon tree in a pot on the third-floor landing. “That's me,” he said. “Third floor. The one with the tree.”

A woman came out onto the landing in a bathrobe and began to water the lemon tree from a saucepan. She was perhaps seventy.

He watched her for a while. “Or, like,” he said. “Near there.”

I drove on. He didn't ask me to stop.

## Questions

“Who are you?” I said. I had been meaning to ask since Sunset. It came out sounding like a deposition.

He laughed. “Wow. Okay. Good morning to you too.”

“I'm serious. I don't know your last name. I don't know what you do.”

“I'm between things.” He shrugged. “Ask Teodoro. He's been between things for thirty years and he's the happiest guy you know.”

I had not mentioned Teodoro.

“How do you know about Teodoro?”

“You told me. Like an hour ago. The radio thing. You think about the radio thing more than you think about your company.”

I had not told him. I was fairly sure I had not told him. But I had also been fairly sure, at six that morning, that I had never been to Zurich.

“Where are you from?”

“Echo Park, mostly.” He considered it. “Before that, I don't know. Around. You know how it is.”

I did not know how it is. I said nothing. He seemed to accept that as an answer. After a while he said, “That's a nice building,” about a building that was not nice.

## Vows

“Can I ask what you said?” he said. “At your wedding.”

I could have told him it was none of his business. It seemed a little late for that.

We were married in Santa Barbara, on a lawn above the water, in front of two hundred and ten people, about thirty of whom Gabriella knew. She had written her vows on the back of a concert program the night before. Some of it was crossed out. I could see the crossing-out through the paper while she read. One of the lines was, “I promise to laugh at you when you need it.” People laughed. I did not understand, at the time, that it was a promise and not a joke.

My vows had been drafted by my head of communications and reviewed by Ira. They were very good. They had a structure: three things I admired, three things I promised, a closing line about the horizon.

Halfway through the second promise, I heard it. Composure, Frank. Not out loud. Just there, under everything, perfectly ordinary. I finished the vows without a pause. Several people told me afterward it was the most moving thing they had ever heard.

Gabriella cried. I did not.

“Huh,” he said, when I had finished telling him. He didn't say anything else for a while. Then: “Was it nice? The lawn?”

“It was very nice.”

“Cool,” he said.

## The 110

The helicopters picked us up somewhere near the 110. I heard them before I saw them. Then I saw them: two, then three, hanging over the freeway, tilted forward, very patient.

“There they are,” {{name}} said, and he sounded almost fond.

I could have turned. There was an exit. I knew where it went. I had a house in Malibu and a house in Montecito and a cabin in Idaho with a satellite phone and enough canned food to see out a small war, and I thought about all of them and took none of the exits. Maybe that was the first good decision I made that day. I'm not sure. It may have been the same decision I had always made, which was to go where I was expected.

“You're doing great,” he said.

“I'm not doing anything.”

“Yeah,” he said. “That's what I mean.”

## Downtown

I remember arriving.

There were helicopters, and drones hanging in the air like punctuation, and red and blue light on every glass surface, and downtown Los Angeles is mostly glass surfaces. A street sweeper was doing its route along the far curb, very slowly, entirely unbothered. Nobody had told it.

The passenger seat was empty. I had not seen him get out, but the seat belt was still buckled, across nobody, and the banana peel was on the floor mat, which I decided to find reassuring.

{{early_for_ira}}

## Coordinates

{{coord_card}}

{{coord_answer}}

{{coord_office}}

## One Call

The phone was still in my hand. If it had been off, I turned it on. There were two hundred and twelve missed calls. I did not look at who they were from. I called my wife.

{{one_call}}

Then the loudspeaker.

Nobody came for perhaps five minutes. I could see them setting up: cars nose to nose across Grand, an officer unrolling tape and tying it to a parking meter, two men in windbreakers arguing quietly by a van, one of them pointing at me and then at a map and then at me again. A woman in a suit was eating a granola bar very fast, as if she had been told she had one minute. Somebody's radio said, “Copy, copy,” and then something about a dog.

I sat in the car with my hands on the wheel at ten and two, as I was taught at sixteen by a driving instructor named Mr. Ebb, who had a glass eye and told me never to trust anyone who flashed their headlights at me. I had followed this advice for twenty-seven years. It had never once come up.

## Hands

**FRANK GAAS. STEP OUT OF THE VEHICLE.**

I stepped out. I raised my hands.

“Sir. Sir. Keep your hands up. Keep them where I can see them. Okay. Turn around. Turn and face away from me. Okay. Now walk backward toward my voice. Slowly. Keep coming. Keep coming.”

It was a woman's voice. She sounded like someone who had said those exact words many times and expected to say them many more. She was very good at it. I was walking backward up Grand Avenue with my hands in the air and two hundred cameras on me, and I admired her for it.

Then another voice said, quite close, *Check the cash, Frank.*

It was not the loudspeaker. It was nearer than that, and older. My father, Malcolm Gaas, counted his change at restaurants, at the table, in front of the waiter, every time, because a man who does not check is a man who will be taken. He said so whenever I looked embarrassed, which was every time.

I would like it noted that I did not decide anything. I have done what that voice told me for forty-three years, and I did it then. I lowered my right hand to my breast pocket, to make sure.

Somebody was shouting “Hold, hold, hold,” which seemed to me a good idea, and a little late.

I did not hear the shot. I am told you do not hear the one that is for you.

I was on my back on Grand Avenue, looking at a drone. It was looking at me. The bills had come out of my pocket and were moving off along the asphalt in the light wind, one at a time, unhurried, as if each of them had somewhere to be. The yellow ticket went with them. Thirty days.

At the far curb, the street sweeper turned the corner and continued its route. Nobody had told it.

## From Here

I am telling you this from somewhere else now. I will not say where yet.

I can see that morning from here, all of it at once: every version, every saucer, every door I closed gently so as not to interrupt. They all end on Grand Avenue with my hand at my pocket. The choices didn't change where I ended up. They changed who arrived. It was always me. It was not always the same man.

I still have the gas station receipt. I do not know how. Sixty dollars, pump four, 8:31 a.m. No apples.
