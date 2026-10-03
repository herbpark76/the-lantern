---
key: dispatch
title: '911'
act: 2
is_bottleneck: false
is_ending: false
reads_flags: []
map:
  x: 2
  y: 3
choices:
- key: start_again
  label: Start the morning again.
  to: open
  sets:
    _new_timeline: true
    route: none
    gabriella_answer: none
    card: none
    office_choice: none
    lawyer_choice: none
  requires: {}
variants:
- slot: cup_hour
  when: {}
  text: The handle pointed at two o'clock.
  priority: 0
- slot: cup_hour
  when:
    timeline: 2
  text: The handle pointed at one o'clock.
  priority: 10
- slot: cup_hour
  when:
    timeline: 3
  text: The handle pointed at twelve o'clock.
  priority: 10
- slot: cup_hour
  when:
    timeline: 4
  text: The handle pointed at eleven o'clock.
  priority: 10
- slot: cup_hour
  when:
    timeline: 5
  text: The handle pointed at ten o'clock.
  priority: 10
- slot: cup_hour
  when:
    timeline_gte: 6
  text: The handle pointed at nine o'clock.
  priority: 5
---

## 911

I called 911. I had never called 911 in my life. People like me have people for that.

My reasons were arithmetic. A man who turns himself in has made a decision. A man who is caught has had a decision made for him. I had spent my whole life making sure I was the first kind of man.

“911, what is the address of your emergency?”

“I don't have an emergency, exactly. My name is Frank Gaas. I think some people are looking for me.”

“Okay. What's the address where you are right now, sir?”

“I'm in my car. On Stone Canyon. Near the reservoir.”

“Are you in a safe location?”

“Yes. I think so.”

“Is anyone with you?”

I checked the passenger seat. “No.”

“Okay. And who is looking for you?”

“The federal government, I believe.”

Typing. “Okay. Can you spell your last name for me?”

“G-A-A-S.”

More typing. Then nothing. I could hear her breathing, and behind her breathing, very faintly, something that should not have been there: a cup set down on a saucer. Shoes on stone. A radio, very low, in Portuguese.

“Sir,” she said, “you're up early.”

## The Cup

There was a cup in the cupholder. I did not remember bringing a cup. It was sitting on a saucer, which is not how anyone carries coffee in a car, least of all me.

{{cup_hour}}

*The coffee was wrong.*
