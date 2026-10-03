---
key: garage
title: The Car
slug: Behind the wheel
act: 2
is_bottleneck: true
is_ending: false
reads_flags:
- route
- gabriella_answer
- card
- office_choice
map:
  x: 1
  y: 2
choices:
- key: call_ira
  label: Call Ira, your lawyer.
  to: lawyer
  sets: {}
  requires: {}
- key: drive
  label: Turn off the phone and drive.
  to: sunset
  sets: {}
  requires: {}
- key: call_911
  label: Call 911. Turn yourself in.
  to: dispatch
  sets: {}
  requires: {}
variants:
- slot: answer
  when: {}
  text: ''
  priority: 0
- slot: answer
  when:
    gabriella_answer: truth
  text: |-
    “I don't know,” I said.

    It came out of me like something I had swallowed thirty years before and had been carrying in my chest ever since, waiting for a doctor.

    I had never said those three words to her. I am fairly sure I had not said them to anyone since I was seven, sitting in a damp chair, waiting for the tablecloth to be changed.

    Gabriella reached across the marble and put her hand on mine. It was warm. I had forgotten that. No, that isn't true; I had stopped checking, which is different, although I had been doing it for so long that from the inside it felt the same.

    “Okay,” she said.

    We stayed like that for a while. Teodoro had found something to do in the pantry. The radio was still on, very low, a man and a woman laughing in Portuguese about something.

    “Okay. Then go find out,” she said. “And call me. Actually call. Not Teodoro, not your office. Me.”

    “I will.”

    “Frank.”

    “I will.”

    I nearly asked her to come with me. I did not. I would like that noted. It was the second mistake I made that morning, and unlike the first, I knew I was making it.
  priority: 10
- slot: answer
  when:
    gabriella_answer: lie
  text: |-
    “It's a mistake,” I said. “I'll handle it.”

    It was my best voice. I had used it on boards of directors and on United States senators, and it had never once failed me. It did not fail me then either.

    Gabriella nodded slowly. Something behind her eyes closed, politely, like a door in a good hotel.

    “Of course you will,” she said.

    She took her phone back and looked at it. “Should I tell Carol we're not coming Saturday?”

    “No. Why would you do that?”

    “Right,” she said. “Why would I do that.”

    I had won. I had always won that conversation. It took me most of the day to understand that I had been winning it for eleven years.
  priority: 10
- slot: answer
  when:
    gabriella_answer: silent
  text: |-
    I said nothing. I picked up my keys.

    Behind me I heard her set her phone face down on the marble. I did not have to turn around. Eleven years. You learn the sounds.

    I had heard her make that particular sound perhaps a hundred times. I had always assumed it was about the phone.

    In the hall, I passed the music room. The door was closed. It was always closed. I stood outside it for a moment with my keys in my hand, and then I went to the garage.
  priority: 10
- slot: card_taken
  when: {}
  text: ''
  priority: 0
- slot: card_taken
  when:
    card: took
  text: |-
    I took the card. It was heavier than a card has any right to be, good stock, the kind my mother used for place cards, and I remember thinking, absurdly, that whoever was ruining my life had at least spent money doing it.

    The window went up. The Suburban backed down my driveway in a careful three-point turn, signaled, although there was nobody to signal to, and rolled away at exactly the speed limit.

    I put the card in my breast pocket, where I keep things I intend to deal with later. Most of them are still there.
  priority: 10
- slot: card_taken
  when:
    card: refused
  text: |-
    “No,” I said. “Thank you.”

    I don't take things from people I have not first had investigated. I have a great many principles like that. Most of them are about not taking things.

    The man didn't argue. “Sure,” he said, and let the card fall from the window onto my limestone. “It's yours either way. I just do the dropping off.”

    The window went up. The Suburban backed down my driveway in a careful three-point turn, signaled, although there was nobody to signal to, and rolled away at exactly the speed limit.

    I left the card where it lay. I looked back at it twice.
  priority: 10
- slot: marcus
  when: {}
  text: ''
  priority: 0
- slot: marcus
  when:
    office_choice: corrected
  text: |-
    “Your name is Marcus,” I said.

    He looked down at his name tag. Then at me. “Sir, it's—” He tapped the tag. “It's Desmond. It's been Desmond. I'm sorry. Are you okay? Do you want some water?”

    “Your daughter's at UCLA.”

    “My daughter is eleven,” he said. He was holding the phone against his chest now, the way you hold something you might need to throw. “Sir, I really need you to wait.”

    I left. He did not try to stop me. He was a decent man, whoever he was, and he had a bad knee.

    Six years of “Mr. G.” In the revolving door it occurred to me that it might have been a name tag too, and that this morning he had been issued a different one. It occurred to me that I might have been issued one.
  priority: 10
- slot: marcus
  when:
    office_choice: waited
  text: |-
    I waited. I am good at waiting. Patience is only control with better posture.

    Desmond stayed on the phone. He said “Yeah” a number of times, and “No, he's just standing here,” and once, “I don't know, a gray one.” Then he said, “He's here,” very quietly, as if he were telling someone their table was ready.

    I was back in my car before I had decided to be.
  priority: 10
- slot: marcus
  when:
    office_choice: walked
  text: |-
    I turned around and walked out. Nobody stopped me, which was almost worse, because it meant they knew where I would go.

    In the revolving door I passed a woman carrying a tray of four coffees. She said “Morning” without looking up, and I said “Morning,” and for a second I was a man going to work.
  priority: 10
---


## Answer
<!-- when: {"route": "gabriella"} -->

{{answer}}

## The Card
<!-- when: {"route": "suburban"} -->

{{card_taken}}

## Teodoro
<!-- when: {"route": "suburban"} -->

Teodoro met me halfway up the driveway. He was holding my phone out in front of him with both hands, as if it might spill.

“Mr. Gaas. It's been going in the drawer. For a long time. I didn't want to open the drawer, but it kept—” He stopped. “I'm sorry. I opened the drawer.”

“It's fine, Teodoro.”

“I know you don't like it before seven.”

“It's fine.”

He gave it to me. He didn't leave. He stood there in his apron on my heated limestone, and I realized he was waiting to see whether I was all right. I had no idea what to do about that. Nobody had waited to see whether I was all right in a long time.

“Thank you,” I said. He nodded and went back up to the house, and halfway there he took out the little black notebook and wrote something down.

**BREAKING · AP**
Federal investigators link Gaas Dynamics credentials to overnight attack on Port of Long Beach systems. CEO Frank Gaas sought for questioning.
*41 missed calls*

Eleven from my general counsel. Three from my chief financial officer. One from my dentist's office. One from a number with a 202 area code. 202 is Washington. Washington does not call to congratulate you.

Gaas Dynamics made software that tells cranes where to put things. Ports, rail yards, warehouses the size of small towns. So it was not absurd that someone had used our keys to get into a port. What was absurd was the someone. According to the phone, it was me.

I did not go back into the house. I went straight to the garage. I tell myself it was to protect Gabriella. It was not to protect Gabriella.

## Marcus
<!-- when: {"route": "office"} -->

{{marcus}}

## The Car

My car was a G63. Black, square, armored to a standard the brochure described as “discreet.” It was the only thing I owned that had never disappointed me. No. The second. I should be accurate; the first was the house. It has occurred to me since that neither of them was a person. The car did exactly what I told it to do. It was built like a bank vault, and it drove like one.

I sat in it with the engine off for perhaps a minute. It is the only room in my life where nobody can see me unless I let them. I have made calls from that seat that moved markets. I have also, twice, sat there and done nothing at all, which I have never told anyone.

In the glovebox there was a tire gauge I had never used and a parking ticket from Santa Barbara, dated 2014, for thirty-five dollars. It had been paid. I don't know why I kept it. I looked at it for a while that morning, as if it might be relevant. It wasn't.

## Fair Condition

Then I read the whole article. I had been avoiding it, as I avoid the full text of anything when a summary is available. There was no summary of this.

At 2:51 a.m., it said, the crane-scheduling system at one of the container terminals began issuing instructions nobody had asked for. Over the next four hours, roughly eleven hundred containers were moved to the wrong places. Two ships were loaded so badly they could not leave their berths, because they would not have been stable at sea. The port was closed until further notice. Trucks were backed up onto the 710 for six miles.

A crane operator named Luis Ortega had been hurt when a container was set down in a lane where he was walking. He was in fair condition.

The instructions had been sent from an administrator account named fgaas. The account had logged in from an address in Zurich.

I did not have an administrator account. I had not logged into anything myself in years; I have people who log in.

I read the injured man's name several times. I did not know what fair condition meant, so I looked it up. It means vital signs are stable and the patient is conscious, but may be uncomfortable.

Then I read the part about Zurich again.

I looked up the nearest hospital to the port and called it. A man answered and said the name of the hospital and asked how he could direct my call.

“I'm calling about a patient. Luis Ortega. He was brought in this morning, from the port.”

“Are you family, sir?”

“No.”

“Then I'm sorry, I can't give out any information.”

“I understand. Could you tell him— ” I stopped. I did not know what I wanted him told. “Never mind. Thank you.”

“Have a good day, sir.”

It was the first time in many years that I had called somewhere and been told no by a person who did not know who I was. It was oddly restful.

When I looked up, something moved in the rearview mirror, a jacket and a grin, and then it was only the road behind me.

Before I could pull out, the phone buzzed with a text from Kendra, my assistant.

“Hi! Ruth is asking whether Morning Ops is still on for 9 or if we should push. Also the Hendersons' assistant confirmed Sat at 7 (not 7:30). Let me know!! Also are you ok”

I read it several times. The two exclamation points. The missing question mark at the end, as if she had typed the last part quickly, before she could decide not to.

I did not answer it. I have thought about that since. She was twenty-eight and had worked for me for three years, and she was the only person at Gaas Dynamics who asked that morning whether I was okay. I did not answer it.

## Stone Canyon

Stone Canyon Road goes down past the reservoir in a long series of curves. I had driven it every weekday for nine years. That morning I drove it slowly, because I could not think what else to do with my hands.

I thought about Gabriella. Not about what she had said, or would say. About her hands. She used to have calluses on the fingers of her left hand, from the strings. Hard little pads. I used to touch them in the dark when she was asleep. I don't know when they went away. It must have taken months. Calluses don't go all at once.

The reservoir was very still. There is a fence around it, and signs saying the water is for drinking, and a man in a county truck who drives around it twice a day looking for something. I have never found out what.

I said “Port of Long Beach” out loud, to hear how it sounded. It sounded like somebody else's problem.

Somewhere down in the canyon, a siren started. Then another answered it.

The peacock screamed again. It was 7:38. It was late.
