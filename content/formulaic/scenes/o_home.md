---
key: o_home
title: The Music Room
slug: Seefeld · 5:40 p.m.
act: 8
is_bottleneck: true
is_ending: false
reads_flags:
- gabriella_answer
- o_mia
map:
  x: 1
  y: 13
choices:
- key: concert
  label: Go to the concert.
  to: o_tonhalle
  sets: {}
  requires: {}
variants:
- slot: her_answer
  when: {}
  text: |-
    “Frank?” she said. “Are you sitting on the floor?”

    “Yes.”

    “Okay,” she said, as if that settled something, and went back to the beginning and played it again.
  priority: 0
- slot: her_answer
  when:
    gabriella_answer: truth
  text: |-
    “Are you all right?” she said.

    In a kitchen in Bel Air, that morning, I had told her the truth for the first time in a long time, which was that I did not know. It seemed a shame to stop now.

    “No,” I said.

    “Okay.” She did not get up. She did not put down the bow. “Me neither, before a concert. Stay there. I'll play it again.”
  priority: 10
- slot: her_answer
  when:
    gabriella_answer: lie
  text: |-
    “You were doing the voice in your sleep,” she said.

    “What voice?”

    “The one for senators. You did it this morning, before you woke up. You said, ‘I'll handle it.’ Three times.” She tightened something on the bow. “Who were you handling?”

    I did not have an answer for that, and she did not seem to need one. She went back to the beginning and played it again.
  priority: 10
- slot: her_answer
  when:
    gabriella_answer: silent
  text: |-
    She did not ask me anything. She looked at me sitting on the floor, and then she went back to the beginning and played it again, slower, all the way through, and I understood about halfway that this was the question, and that she was going to keep asking it in the only way she knew until I had an answer.
  priority: 10
---


## The Wrong Man
<!-- when: {"o_mia": "refused"} -->

“I'm sorry,” I had said, at the restaurant, under the small blue painting. “I think you have the wrong man.”

She had looked at me for a long time, without much expression, the way I imagine she looked at people on her ward when they told her something she had heard before.

“That's what you said last time,” she said, and picked up her bag, and left.

She left the receipt on the tablecloth. I sat with it through the veal. When I paid, I put it in my breast pocket with the other one, and then I walked home along the lake, the long way, and did not look at my number once, which I want on the record, because it was harder than anything I did that day.

## The Music Room

The apartment was quiet when I came in, except for the cello.

She was practicing in the small room at the end of the hall, with the door open. I could see one corner of her: the scroll of the instrument, her left hand moving on the neck, the edge of a music stand with a pencil balanced on it. She was playing the opening of the Elgar, the same eight bars over and over, stopping and starting, taking one passage apart and putting it back together a little differently each time, the way you might try a key in a lock at different angles.

My phone buzzed in my pocket. It was six o'clock. Singapore.

In Bel Air there had been a day like this. I was on a call, and she was playing with the door open, and I got up and walked down the hall and closed the door, very gently, so as not to interrupt her. I have been told since that I did it so gently she did not hear it close, and only noticed later that the hall had gone quiet. She stopped playing the cello not long after that. I do not think it was the only reason. I do not think it was not a reason.

I let Singapore buzz. I did not close the door. I sat down on the floor of the hall in my blue suit with my back against the wall and listened.

After a while she stopped and looked up and saw me.

{{her_answer}}
