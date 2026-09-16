import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to the questions the MSSL board is asked most: eligibility, gear, fees, rescheduling and team registration.",
};

const FREE_AGENT_FORM =
  "https://microsoft.sharepoint.com/teams/MicrosoftSoccerLeagueMSSL/_layouts/15/listforms.aspx?cid=NDYwZDBiM2YtMmQxNi00OTFmLTkyNGEtZmQxZmEzZWU1MjJm&nav=MDg5NjBjYjQtMDFiNC00OWI2LWJkYmYtNjc1Yzc4ZDMzOWIx";
const SPORTS_FIELDS =
  "https://microsoft.sharepoint.com/teams/EventionsRedmond/SitePages/Sports-Fields-and-Courts-Information.aspx";
const REFEREE_INTEREST =
  "https://microsoft.sharepoint.com/:l:/t/MicrosoftSoccerLeagueMSSL/FG4YEp1IMXlFtb3RxA3Lk9kBeC7Y7HCt58DOEZfEq0BmJQ?nav=NTg2NThiYWYtOTYyMC00MDU3LWI1MWUtODA3ZTEwMGIwODdh";

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** A labelled bullet: the rule in bold, the reasoning underneath it. */
function Rule({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li>
      <span className="font-medium">{label}</span>
      <p className="text-muted mt-0.5">{children}</p>
    </li>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2">{children}</ul>;
}

interface FaqItem {
  q: string;
  a: ReactNode;
}

interface FaqSection {
  id: string;
  heading: string;
  items: FaqItem[];
}

const SECTIONS: FaqSection[] = [
  {
    id: "general",
    heading: "General Questions",
    items: [
      {
        q: "Am I eligible to play in the MSSL?",
        a: (
          <p>
            If you are at least 18 years of age and a Microsoft FTE (including interns) you are
            eligible to participate in an MSSL-sanctioned game. This means that you must have a
            current blue badge to participate.
          </p>
        ),
      },
      {
        q: "I'm new to Microsoft or wanting to get involved in the MSSL as a player. What do I do?",
        a: (
          <>
            <p>
              If you would like to register as a free agent and have your information shared with
              all of the team managers, please complete the form at{" "}
              <A href="https://aka.ms/msslfa">aka.ms/msslfa</A>. The board will then send out an
              email to the team managers and they will contact you directly if they are looking for
              additional players.
            </p>
            <p>
              You can also create a new team if you have enough players. New team registrations can
              be submitted at <A href="https://aka.ms/mssltr">aka.ms/mssltr</A>.
            </p>
          </>
        ),
      },
      {
        q: "What soccer gear is required to play in the MSSL?",
        a: (
          <>
            <p className="font-medium">Gear</p>
            <Bullets>
              <Rule label="Shin guards">
                Must provide reasonable and adequate protection to the player and they must be
                unmodified. No, shin guards out of cardboard are not permitted.
              </Rule>
              <Rule label="Molded cleats or turf shoes">
                Metal cleats are prohibited as the league board has determined them to be inherently
                unsafe.
              </Rule>
            </Bullets>

            <p className="font-medium">Other</p>
            <Bullets>
              <Rule label="No jewelry">
                Bracelets, watches, bands, rings (except wedding rings), sunglasses, baseball caps
                (except keepers), or knee/elbow/wrist supports containing metal/hard materials are
                considered unsafe and prohibited in the MSSL.
              </Rule>
              <Rule label="No fitness bands/trackers">
                Fitness bands and trackers cannot be worn during MSSL games as they are considered
                unsafe and prohibited in the MSSL. Fitness bands/trackers are only allowed to be
                worn for medical-related purposes.
              </Rule>
            </Bullets>

            <p>Players will not be allowed to play if they do not have the proper gear.</p>
          </>
        ),
      },
      {
        q: "I don't have a team. Can I be placed on a team?",
        a: (
          <>
            <p>
              Absolutely! Please fill out the <A href={FREE_AGENT_FORM}>Free Agent Interest form</A>{" "}
              and we will send out your information to all MSSL Team Managers. If they have spots
              available on their team, they will contact you with more information.
            </p>
            <p>The team manager can let you know if there are any team fees you need to pay.</p>
          </>
        ),
      },
      {
        q: "How many teams can I play on in the MSSL?",
        a: (
          <>
            <p>
              As a field player, you can play on one MSSL team during the season. Goalkeepers are
              allowed to play on more than one team in the league however, they must only roster and
              play for one team during any playoffs or finals.
            </p>
            <p>
              Players can play with multiple teams (&ldquo;try out&rdquo;) up until the fourth game
              of the season. After the fourth game, players must choose and roster with one team.
              Only in extreme and extenuating circumstances can a player move teams during the
              season. Players can reach out to the MSSL Board if they need to request a team move.
            </p>
          </>
        ),
      },
      {
        q: "What do I need to bring to a game in order to play?",
        a: (
          <>
            <p>
              <span className="font-medium">Your Microsoft FTE/intern blue badge.</span> If you do
              not physically have your badge at the game, you will not be able to play.
              Verifications via Org Explorer, Email, and Teams are not permitted. Referees will be
              checking badges and players are expected to produce their badge upon request to
              referees.
            </p>
            <p>
              <span className="font-medium">Proper soccer gear and equipment.</span> If you do not
              have the proper gear as listed in the MSSL Rules and Regulations, you will not be
              allowed to play. No exceptions.
            </p>
            <p>
              <span className="font-medium">Water.</span> Drinks are not provided by the MSSL.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "league",
    heading: "League Questions",
    items: [
      {
        q: "How many seasons are there in the MSSL & how long are the seasons?",
        a: (
          <p>
            Seasons for the MSSL typically include: Spring, Summer, Fall, &amp; Winter. Season
            length varies based on access to Microsoft fields and reschedules.
          </p>
        ),
      },
      {
        q: "What is the cost to play per season?",
        a: (
          <>
            <p>
              The cost varies based on how many teams play but typically the price will range from
              $120 to $200 per team each season.
            </p>
            <p>
              These funds go directly to paying for referees. If there are funds remaining (if a
              game doesn&rsquo;t have a referee) then funds are used for any of the below:
            </p>
            <Bullets>
              <li>Discounting team fees for the next season.</li>
              <li>Providing a free MSSL season to all teams.</li>
              <li>
                Purchasing referee or soccer equipment (i.e., whistles, ref pinnies, new nets, etc.)
                when needed.
              </li>
            </Bullets>
          </>
        ),
      },
      {
        q: "How many games are there per season?",
        a: (
          <>
            <p>The number of games will depend on a few factors:</p>
            <Bullets>
              <li>If a team forfeits.</li>
              <li>If a reschedule cannot be accommodated.</li>
              <li>Number of teams in the league.</li>
              <li>Availability of Microsoft fields.</li>
            </Bullets>
            <p>On average, we try to ensure teams get at least 10 games in per season.</p>
          </>
        ),
      },
      {
        q: "My team wants to set up practices. Can we get an MSSL field reservation?",
        a: (
          <>
            <p>
              Unfortunately, no. MSSL field reservations are for MSSL-sanctioned games and with
              limited field availability, we can&rsquo;t give them to teams for practice.
            </p>
            <p>
              If you would like to schedule a practice for your team, you can go to{" "}
              <A href={SPORTS_FIELDS}>Sports Fields and Courts Information</A> and request space
              through Eventions. Some important notes:
            </p>
            <Bullets>
              <li>
                Do not reserve a request through Eventions under the Microsoft Soccer League.
                Reservations must be under your own name.
              </li>
              <li>
                When you request a booking through Eventions, make sure you read all the rules and
                requirements for field usage. This includes making sure that you understand that you
                are a leisure booking and your booking could be bumped for business or league
                purposes.
              </li>
            </Bullets>
          </>
        ),
      },
    ],
  },
  {
    id: "game-day",
    heading: "Game-Related Questions",
    items: [
      {
        q: 'We don\'t have a referee for our game, or the referee is a "no-show". What do we do?',
        a: (
          <p>
            Sometimes this happens! In the event that a referee is unavailable or is a
            &ldquo;no-show&rdquo;, the MSSL Team Managers can work together to ensure that game play
            continues and that all MSSL League rules are followed.
          </p>
        ),
      },
      {
        q: "We thought we had enough players for the game, but some didn't show up. What can we do?",
        a: (
          <>
            <p>
              <span className="font-medium">Regular season games:</span> If team managers agree that
              a player can be borrowed when one of the teams is short players, then the game can be
              considered official, and no forfeit is required. However, this must be decided before
              the start of the game and discussed with the referee. If a team manager does not agree
              to the borrowing, then the team borrowing a player forfeits the match.
            </p>
            <p>
              A friendly game may still be played if the game is forfeit but certain rules still
              apply. The referee can choose to leave as the game is no longer an MSSL sanctioned
              game.
            </p>
            <p>
              All MSSL Rules &amp; Regulations still apply when a game is forfeit as the field is
              under an MSSL reservation. For example, you still cannot have non-Microsoft FTEs or
              interns participate in a game and safety equipment is still required.
            </p>
            <p>This does not apply to playoff and final games.</p>
          </>
        ),
      },
      {
        q: "I need to reschedule a game. How do I do that?",
        a: (
          <>
            <p>
              All rescheduling requests must be submitted at least 48 hours prior to the scheduled
              game. Team managers are responsible for ensuring that they have submitted a reschedule
              if their team cannot attend and is responsible for collaborating with the opposing
              team manager to identify a potential reschedule date. If a team manager requests a
              reschedule less than 48 hours prior to the game, it will result in a forfeit for the
              team needing the reschedule. Exceptions may be made in rare circumstances, including
              but not limited to inclement weather, by the MSSL Board.
            </p>
            <p>
              At times, Microsoft Eventions may rescind a field reservation for field maintenance,
              business events, or another reason (often with less than 48-hour notice). In the case
              of a field rescind, the MSSL Board will look at the schedule and begin moving games,
              updating calendar invites, and emailing the team managers notifying them of the
              change.
            </p>
            <p>To request a reschedule, team managers need to:</p>
            <Bullets>
              <li>
                Connect with the opposing team manager and identify an available reschedule date
                from <A href="https://aka.ms/msslcs">aka.ms/msslcs</A>.
              </li>
              <li>
                Submit a rescheduling request via the{" "}
                <A href="https://aka.ms/msslgr">Rescheduling Request Form</A>.
              </li>
              <li>Respond to any inquiries from the MSSL Board regarding the request.</li>
            </Bullets>
          </>
        ),
      },
    ],
  },
  {
    id: "team-managers",
    heading: "Team Manager Questions",
    items: [
      {
        q: "How do I register a new team for an upcoming season?",
        a: (
          <p>
            You can register a new team by going to{" "}
            <A href="https://aka.ms/mssltr">aka.ms/mssltr</A> and completing the registration form.
          </p>
        ),
      },
      {
        q: "How do I register an existing team for an upcoming season?",
        a: (
          <p>
            You can register an existing team for an upcoming season by going to{" "}
            <A href="https://aka.ms/mssltr">aka.ms/mssltr</A> and completing the registration form.
          </p>
        ),
      },
      {
        q: "Where do I submit my roster?",
        a: (
          <p>
            Rosters are due at the end of the third week of the season. Rosters can be submitted at{" "}
            <A href="https://aka.ms/msslroster">aka.ms/msslroster</A>.
          </p>
        ),
      },
      {
        q: "How do I reschedule a game?",
        a: (
          <>
            <p>
              Go to the current season page (<A href="https://aka.ms/msslcs">aka.ms/msslcs</A>) and
              view the available reschedule slots. Slots are removed from the list once teams have
              been approved for that reschedule request.
            </p>
            <p>
              Both team managers should identify a time that works for both teams and then ONE of
              the team managers should submit the request.
            </p>
            <p>
              To complete the request, go to <A href="https://aka.ms/msslgr">aka.ms/msslgr</A>.
            </p>
            <p className="border-warning/40 bg-warning/10 text-warning rounded-lg border p-3">
              <span className="font-semibold">Important.</span> Rescheduling requests are required
              to be made, at the latest, 48 hours before the scheduled game. Any requests inside the
              48-hour window will result in a forfeit for the team that was unable to field enough
              players.
            </p>
            <p>
              <span className="font-medium">Exceptions:</span> The only exceptions to the 48-hour
              rule are for weather related cancellations and field cancellations by Microsoft.
            </p>
            <p>
              Team managers will receive an email from the board noting whether the request has been
              approved or denied.
            </p>
          </>
        ),
      },
      {
        q: "What do I need to do if my team needs to forfeit?",
        a: (
          <p>
            Email the MSSL Board, cc the referee scheduled to ref your game, and notify them of the
            forfeit.
          </p>
        ),
      },
    ],
  },
  {
    id: "referee",
    heading: "Referee",
    items: [
      {
        q: "How do I sign up to be a referee?",
        a: (
          <p>
            You can submit your interest <A href={REFEREE_INTEREST}>here</A>!
          </p>
        ),
      },
      {
        q: "How many games will I referee during a season?",
        a: (
          <>
            <p>
              You can choose how many games you referee during the season! When the list of games is
              sent out, you will be able to sign up for the games that you are available to referee.
            </p>
            <p>
              We truly appreciate you taking the time to referee and to fill spots that are open, it
              makes for a better season for everyone involved!
            </p>
          </>
        ),
      },
      {
        q: "How much are referees paid?",
        a: <p>Referees typically make $50/game.</p>,
      },
      {
        q: "If I'm a referee, can I still play in the MSSL League?",
        a: (
          <>
            <p>Yes, you can!</p>
            <p>
              The exception to this rule, <span className="font-semibold">to ensure fairness</span>,
              is that if your team is leading at the end of the season and the game that you are
              refereeing for has one or more of the teams you are competing for standing with, you
              must excuse yourself and find another referee for the game. This prevents any concerns
              of potential conflict or bias within the MSSL league.
            </p>
          </>
        ),
      },
      {
        q: "What if I can't make a game or what if the team forfeits?",
        a: (
          <>
            <p>
              <span className="font-medium">Unable to make the game:</span> Please let the{" "}
              <A href="mailto:msslbd@microsoft.com">MSSL Board</A> know, at least 48 hours before a
              game (when possible), if you are unable to referee a game you previously signed up
              for.
            </p>
            <p>
              <span className="font-medium">Forfeits:</span> If a team forfeits, they should notify
              the MSSL Board via email and cc you on the email.
            </p>
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Help"
        title="Frequently asked questions"
        description="Eligibility, gear, fees, rescheduling, refereeing and team registration — the questions the MSSL board answers most."
      />

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
            <h2 id={`${section.id}-heading`} className="mb-3 text-lg font-semibold">
              {section.heading}
            </h2>
            <div className="space-y-2">
              {section.items.map((item) => (
                <Card key={item.q} as="article">
                  <details className="group">
                    <summary className="hover:bg-surface-muted cursor-pointer list-none rounded-xl p-4 text-sm font-medium">
                      <ChevronRight
                        aria-hidden="true"
                        size={14}
                        className="text-brand mr-2 inline-block align-text-bottom transition-transform group-open:rotate-90"
                      />
                      {item.q}
                    </summary>
                    <div className="space-y-3 px-4 pb-4 pl-9 text-sm">{item.a}</div>
                  </details>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-muted mt-8 text-sm">
        Still stuck? The{" "}
        <Link href="/rules" className="underline">
          league handbook
        </Link>{" "}
        covers the competition rules in full.
      </p>
    </div>
  );
}
