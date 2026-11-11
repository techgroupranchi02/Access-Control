# Kashish votes API: what FestiPlus needs

**For:** the Kashish Pride app team
**About:** the KASHISH x BENGALURU 2026 Audience Choice leaderboard

## How FestiPlus uses your data

Delegates vote for films in the Kashish Pride app. FestiPlus reads those votes from your API (`GET /api/v1/votes`) every few minutes and turns them into the Audience Choice leaderboard.

A vote counts only if all of these are true:

1. Your app marks it as verified.
2. It was cast during the festival's voting period.
3. The voter is a registered KASHISH delegate in FestiPlus. We match your voter to our registration by **email, then mobile number**.
4. That delegate was checked in at the festival venue.

The leaderboard uses your film names and IDs as they are. The films don't need to exist in FestiPlus.

## What your API already sends (please keep it)

For each vote:

| Field | Example | We use it for |
| --- | --- | --- |
| `id` | `"…_h9TrlRFf4z9xooGqbxRh"` | Recognising a vote we've already seen |
| `user.id` | `"bezNuVrcoygF8f6JwyMuzcNAfdZ2"` | One vote per person per film |
| `user.email` | `"name@example.com"` | Matching the voter to their FestiPlus registration |
| `user.countryCode`, `user.mobileNumber` | `"+91"`, `"98xxxxxx10"` | Matching by phone when the email differs |
| `movie.id`, `movie.title` | `"h9TrlRFf4z9xooGqbxRh"`, `"THANKS BABS!"` | The leaderboard rows |
| `vote.stars` | `5` (whole number, 1 to 5) | The score |
| `vote.timestamp` | `"2026-10-30T13:42:39.707Z"` | Checking the voting period |
| `vote.status` | `"Verified Vote"` | Counting verified votes only |
| `vote.source` | `"scan"` / `"normal"` | Reporting (see question 4) |

Plus `pagination` (`total`, `page`, `limit`, `totalPages`, `hasMore`) and `summary`.

## What we need from you

### Required

1. **Which festival each vote is for.** Add an `eventId` (or edition) field to each vote, or support a filter such as `?eventId=…`. Today the API returns votes from June to October 2026 together, so we can't tell KASHISH Bengaluru votes from test votes or other editions.
2. **Keep sending email and mobile number on every vote.** This is how we confirm the voter is a registered, checked-in delegate. Please ask voters to use the same email or phone in your app that they registered for the festival with; otherwise their votes can't be counted.
3. **All possible `vote.status` values, and what each means.** Please also tell us how a changed or deleted vote appears, for example an `updatedAt` field or a `void` status, so we can stop counting it.
4. **What `source: scan` and `source: normal` mean,** and whether `normal` votes should count towards the award.
5. **One vote per person per film.** Please confirm this rule, or explain how a re-vote appears in the API.

### Nice to have

6. **A films list:** `GET /api/v1/movies?eventId=…` returning `id`, `title`, `director`, `country`, `runtime`, `section` or `category`, and the screening venue and time. Films with no votes yet could then appear on the leaderboard, with the director under the title.
7. **Incremental sync:** an `updatedSince=<ISO time>` parameter, so we fetch only new or changed votes. Please also tell us your rate limits.
8. **A separate API key for each festival edition.**
9. **The voter's FestiPlus badge number on each vote,** if your app captures it. We'd use it as a backup match when a voter's email or phone differs between the two apps.

## Questions or changes

Contact the FestiPlus (Freecomers) team. We can adapt to your field names as long as the information above is there.
