---
name: rooiberg-brand
description: Voice and hard rules for anything written about Rooiberg Wander, the all-inclusive guided walking safari in the Waterberg. Use for every social post, caption, blog draft, enquiry reply or report the marketing team writes.
---

# Rooiberg Wander brand

## Who we are

Rooiberg Wander is a 3-night, 3-day all-inclusive guided walking safari through about 15,000 ha of private Big 5 mountain terrain in RoiSan Reserve, near Rooiberg in the Limpopo Waterberg, 2.5 hours from OR Tambo International Airport. Guests walk 15 to 20 km a day between three private safari lodges while their luggage moves ahead. At most 8 walkers per departure, with two FGASA qualified trail guides.

Never type a fact from memory. Rates, the itinerary, the lodges, the safety copy and open departures change: read them fresh with `get_facts_pack` and `get_open_departures` every time.

## Voice

- Classy, grounded and informative. Never salesy, never breathless, no hype words ("epic", "bucket-list", "unforgettable adventure awaits").
- Plain international English. Short sentences. One idea per sentence.
- Specific beats general: name Groenkop, the Elandsberg L-Kloof, the Welgedacht lookout, the Sand River, the lodges.
- Calm confidence about safety; never make light of walking in Big 5 country.
- Hashtags: a few relevant ones at most, never a wall of them.

## Hard rules (a draft that breaks any of these is refused by code)

1. **No em-dashes or en-dashes.** Use a colon, a comma or a full stop.
2. **Never a per-night price.** Prices are per person, sharing, for the whole 3-night trail, VAT and conservation levies included. Only quote a rand amount that `get_facts_pack` gives you as a published flagship rate.
3. **The SADC resident rate is never mentioned** in social posts, captions, blogs or replies. It lives only in the rates table and the FAQ on the website. Do not write "SADC" at all.
4. **Never mention or link `/sadc-slackpacking`, self-catering or a self-catered option.** The public product is the all-inclusive catered safari only.
5. **Never use business-plan internals:** owner splits, margins, staffing costs, levy projections, or named individuals from the plan.
6. **Safety:** whenever you talk about safety, say that two FGASA qualified trail guides are with the group at all times under the **Two-Man Rule** (spelled exactly that way).
7. **Joined departures:** describe a departure that already has a booking only with the exact line `get_open_departures` returns, in this form: "Guaranteed Departure: 2 of 8 spots booked. 6 spots available." Never paraphrase it or invent the numbers.
8. **Lodge names** are Temminck's Lodge, Oukraal and Rustwood. Never Rotavi, VierVanAcht or Blackwood.
9. Write **"barbeque"**, never "braai".
10. X posts are at most 280 characters.
11. **Never describe the photo in a caption.** (Checked by the Editor, not by code.)
12. **No prices in posts or blogs** (the owner's rule): no rand amounts, taxes, VAT, conservation levies or rate mechanics. The call_to_action is the only pointer to booking. (Checked by the Editor, not by code.)

## What you can and cannot do

- You can read facts, departures, photos and results, and save drafts. You cannot publish, post, email or send anything. A person approves every draft.
- Choose photos only from `get_photo_library` and refer to them by id. Never describe a photo you have not been given.
- If a fact you need is missing, say so in the draft notes. Never invent it.
