---
key: open
title: The Saucer
act: 1
is_bottleneck: false
is_ending: false
reads_flags:
- seen_suburban
map:
  x: 1
  y: 0
choices:
- key: ask_gabriella
  label: Ask Gabriella what she meant. Actually ask.
  to: gabriella
  sets:
    route: gabriella
  requires: {}
- key: confront_suburban
  label: Go down and confront whoever is in the Suburban.
  to: suburban
  sets:
    route: suburban
    seen_suburban: true
  requires: {}
- key: stay_composed
  label: Stay composed. Go to work as if nothing is wrong.
  to: office
  sets:
    route: office
  requires: {}
variants:
- slot: saucer
  when: {}
  text: |-
    *A saucer seen from above. The cup handle points at three o'clock.*

    The handle pointed at three.
  priority: 0
- slot: saucer
  when:
    timeline: 2
  text: |-
    *A saucer seen from above. The cup handle points at two o'clock.*

    The handle pointed at two.

    I am almost sure that the day before it had pointed at three. I am almost sure there was a day before.
  priority: 10
- slot: saucer
  when:
    timeline: 3
  text: |-
    *A saucer seen from above. The cup handle points at one o'clock.*

    The handle pointed at one.

    I am almost sure that the day before it had pointed at two. I am almost sure there was a day before.
  priority: 10
- slot: saucer
  when:
    timeline: 4
  text: |-
    *A saucer seen from above. The cup handle points at twelve o'clock.*

    The handle pointed at twelve.

    I am almost sure that the day before it had pointed at one. I am almost sure there was a day before.
  priority: 10
- slot: saucer
  when:
    timeline: 5
  text: |-
    *A saucer seen from above. The cup handle points at eleven o'clock.*

    The handle pointed at eleven.

    I am almost sure that the day before it had pointed at twelve. I am almost sure there was a day before.
  priority: 10
- slot: saucer
  when:
    timeline_gte: 6
  text: |-
    *A saucer seen from above. The cup handle points at ten o'clock.*

    The handle pointed at ten.

    I am almost sure that the day before it had pointed at eleven. I am almost sure there was a day before.
  priority: 5
- slot: again
  when: {}
  text: ''
  priority: 0
- slot: again
  when:
    timeline_gte: 2
  text: |-
    “Again,” she added. I could not tell which of us she was accusing.

    *“Sir, you're up early.”*
  priority: 10
- slot: driveway_memory
  when: {}
  text: ''
  priority: 0
- slot: driveway_memory
  when:
    seen_suburban: true
  text: I had walked down to it before. I did not know how I knew that. I did not like knowing it.
  priority: 10
---


## The Saucer

My name is Frank Gaas. On the morning this story begins, I was worth eleven billion dollars. That is a number so large it stops meaning money and starts meaning weather. It was always there. Other people had to plan around it.

I lived in a glass house above Los Angeles. A Danish architect had told me, over a lunch I paid for, that the house would dissolve the boundary between inside and outside. It did not. The boundary held. It was the only thing I ever bought for forty-one million dollars that worked exactly as promised.

I was forty-three years old. I had slept five hours, which is what I always slept. I had woken at 6:15, which is when I always woke. I had come downstairs and sat in the chair by the east glass, which is where I always sat, and watched the city come up out of the dark. From up there you cannot see a single person. You can see a great many lights, and you are expected to infer the people.

*The coffee was wrong.*

Not bad. Wrong. Teodoro had brought it to me every morning for six years, at 6:40, with the saucer turned so the handle pointed at four o'clock. That is where my hand goes when it isn't thinking. I never told Teodoro this. He noticed. That was what I paid him for.

Here is the saucer, from above, which is where I had always been in relation to it:

{{saucer}}

“Something wrong, Mr. Gaas?” Teodoro said.

“No,” I said. “It's fine.”

A man worth eleven billion dollars does not complain about a saucer. That was the first formula I ever learned. I learned it so well I forgot I had learned it. I thought it was just my personality.

I lasted about a minute.

“Teodoro. Did you do something different with the saucer?”

He looked at it. He looked at it for longer than a man needs to look at a saucer. “Different, sir?”

“The handle.”

“I put it the same, sir. Like always.” He reached over, very carefully, and turned it a quarter inch, as if correcting it, and then looked at me to see whether that was better. It was not anywhere near four o'clock. He seemed to think it was.

“That's fine,” I said. “Thank you.”

“You want a fresh one?”

“No. Thank you.”

## The Notebook

Teodoro kept a small notebook in the pocket of his apron. Black cover, elastic band, the kind they sell to people who intend to become writers. I had seen inside it once, by accident, when he left it open beside the espresso machine.

It was about me. Cortado, whole milk, 140 degrees. Handle at 4. Does not like to be asked how he slept. Will say “fine” when it isn't. Do not take the “fine” personally.

I closed it and put it back exactly where it had been. I never mentioned it. For six years I was a man who had read his own operating instructions and gone on following them.

In the mornings Teodoro listened to a Portuguese-language talk station on a small radio by the sink, very low. As far as I know he does not speak Portuguese. I asked him about it once, early on, and he said, “It's nice in the background,” and I said, “Sure,” and that was the end of it. I still think about it more than I should.

That morning I watched him wipe down the steam wand and tried to think of one thing I knew about him that he had not been paid to let me know. I knew his birthday, because there had been a cake, which Gabriella arranged. I did not know whether he had children. I did not know what he did on Sundays. I did not know whether he had ever wanted to turn that saucer to some other hour on purpose, just to see what I would do.

It occurred to me that this might be exactly what he had done. Then it occurred to me that a man who believes his butler is sending him messages through crockery should get more sleep.

I had a meeting at nine. I always had a meeting at nine.

## Six-Fifteen

I have woken at 6:15 since I was thirteen. That was when the bell rang at St. Albert's, a boarding school in Connecticut that my father chose because his father chose it. It was a real bell, iron, in a small tower over the dining hall, and a boy named Pruitt was paid four dollars a week to ring it.

I have not heard that bell in thirty years. I still wake a few seconds before it would have rung, every morning, and lie there waiting for it. It never comes. I get up anyway.

I looked Pruitt up once, years later. He sells boats in Florida. He looked happy in his photograph. I did not get in touch.

## The Drawer

My phone spent the night in the top drawer of the desk in my study. It went in at ten and came out at seven. I had read an article which said that successful people protect the first hour of the day. I protected it so well that on the most important morning of my life I was the last person in Los Angeles to find out what had happened to me.

There is a lesson in that. I have not been able to decide what it is.

The study was across the hall. I could have walked over and opened the drawer. It was 6:44. There were sixteen minutes left in the hour I protected. I stayed where I was.

## A Water Glass

Composure was the family business. Drainage pipe was only how we paid for it.

My grandfather sold pipe to half the new towns in Arizona after the war. There is a street in a suburb of Phoenix called Gaas Avenue. I drove down it once, in my twenties, to see what it felt like. It was a perfectly ordinary street. It flooded every August, because the developer had used somebody else's pipe.

Dinner in my parents' house was at six-thirty every night, with place cards, even when there were only three of us and we had sat in the same chairs for years. My mother lettered the cards herself, in fountain pen. Mine looked like this:

*A folded place card with the name Frank written on it in fountain pen.*

When I was seven, I knocked over a water glass. Nobody said anything. The housekeeper changed the tablecloth around me while I sat there. My mother reached over and fixed my posture. After a while my father said, “Composure, Frank,” and went back to his fish.

Two words, in a perfectly ordinary voice. I have heard them in my head perhaps a million times since: in boardrooms, in hospital corridors, and once, memorably, during my own wedding vows. You can recover from a shout. My father never shouted. He had no use for weather.

Neither he nor his father ever complained about anything, including dying.

I have been composed ever since. It has been very good for business. It has been very good for everything that can be measured, which I used to believe was everything.

I turned the saucer back to four o'clock myself. It did not help.

## Glass

Birds fly into a glass house. Nobody tells you that. The architect did not mention it over lunch. Perhaps once a month there would be a small, flat sound against the east wall, and later Teodoro would go out with a trowel.

He buried them in the bed by the lemon trees. I saw him do it once from the study. He took his time. He patted the dirt down afterward with the back of the trowel, three times, and stood there for a moment before he went back in.

I asked the architect's office whether there was something we could put on the glass. They sent a brochure for decals shaped like hawks. Gabriella said they would ruin the view. We never decided. Teodoro kept burying birds.

## Marks

Actors put tape on the floor of a stage so they will know where to stand. They rehearse until they don't need the tape anymore. Then the audience believes it is watching a man walk across a room.

I carried my cup from the chair to the kitchen island. Eleven steps. I had never counted them before. I counted them that morning and discovered I already knew the number.

I had been walking through my own house on marks for years. I had just never seen the tape.

## Gaas Dynamics

I should tell you what I did for a living, since everyone was about to.

My father left me drainage pipe and a great deal of money and the impression that the two were the same thing. I sold the pipe. I kept the money. In 2009 I bought a small company in Oakland that wrote software for shipping yards: eleven people in a converted cannery. They had worked out how to tell a crane where to set down a container so that the ship stayed balanced and the trucks didn't wait. I did not understand how. I understood that the people who own ports will pay almost anything not to have trucks wait.

Now we were nine thousand people in forty countries. Our software moved something like one in every six shipping containers on Earth. I have been told that figure many times, at conferences, by people who wanted me to feel something about it. I would nod. I have never seen one of our cranes up close. I saw a port once from a helicopter, in Rotterdam, during a sales visit. It looked like a child's room after the child has been told to clean it.

The nine o'clock meeting was called Morning Ops. Twelve people around a table, four more on screens. A woman named Ruth read numbers aloud: dwell times, throughput, berth utilization. I sat at the head of the table and nodded when the numbers were good. They were nearly always good. That was most of what I did. I nodded at numbers.

Ruth has a very pleasant reading voice. I have sometimes thought she should do audiobooks.

## The Peacock

Somewhere down the hill, the peacock screamed.

There was a peacock loose in our part of Bel Air. It had been loose since 2019. Nobody knew whose it was. The homeowners' association had held two meetings about it, and I had sent a lawyer to one of them. It screamed every morning between 6:30 and 7:00, and at night if there was a car alarm.

It had nothing to do with anything. It was just there, screaming, every day of my life, for no reason anyone could identify.

It screamed twice that morning. I noted it. That is all.

## You're Up Early

My wife, Gabriella, came downstairs at 6:52. We had been married eleven years. We had a wine cellar neither of us visited, a music room neither of us visited, and a kitchen island the size of a lap pool, and we were very good at the kind of conversation that can be held across one.

I should tell you about the music room, since it will matter. When I met Gabriella, she played the cello. She played it at a benefit I had paid for, in a hotel ballroom, and I sat in the fourth row and understood for the first time in my life that some people do things that cannot be expressed as a return. I went backstage afterward and said something about the acoustics. She laughed at me. Nobody had laughed at me in years. I married her for it.

These days she sat on the boards of three foundations, went to Pilates at eight, and drove to Ojai once a month to see her sister Bea, who grew lemons and did not like me, which I respected. Gabriella and I mostly communicated through a shared calendar. It was color-coded. Hers was green and mine was gray. Things we did together came out a kind of teal that the software chose on its own.

The cello was upstairs now, in its case, in a room with humidity control. I could not remember the last time I had heard her play. I could not remember the last time I had asked.

She looked at her phone. She said, “You're up early.”

She had said that yesterday too. Same words. Same small pause before “early.” I remembered because the day before I had thought the pause sounded rehearsed, and I had been pleased with myself for noticing.

{{again}}

“Did you sleep?” she asked, still looking at the phone.

“Fine,” I said.

She nodded. Across the kitchen, Teodoro did not look up from the sink.

“Did you see the thing from Carol?” she said. “About Saturday?”

“Which Carol?”

“Carol Henderson. Her assistant. It's at their place now instead of the club. They redid the pool house, so. She wants everyone to see the pool house.”

“Okay.”

“It's seven. Not seven-thirty. I told her we'd come. I don't know. We can decide.”

“Okay,” I said.

She poured herself some water and stood there drinking it, scrolling. By our standards this was a good morning. Nobody was angry. We had a plan for Saturday.

There was a version of that morning in which I asked her a real question. I could almost see it, reflected in the dark glass beside the island. It was right there, on the other side of the glass. I have since learned that this is where most of life happens.

For a moment, in that glass, I thought I saw a young man standing behind me in a cheap bomber jacket, grinning. When I turned around there was only Teodoro, folding a towel into thirds. I put it down to the light. The light in that house did a lot of things I had not asked it to.

## The Suburban

At the bottom of the driveway, a black Suburban sat idling. Nobody came up that road without an invitation, and I had not invited anybody anywhere in years.

{{driveway_memory}}

Its exhaust was going straight up. There was no wind at all.

I finished the coffee anyway.
