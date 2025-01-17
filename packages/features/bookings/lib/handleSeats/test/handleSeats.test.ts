import prismaMock from "../../../../../../tests/libs/__mocks__/prisma";

import { describe, test, vi, expect } from "vitest";

import { appStoreMetadata } from "@calcom/app-store/apps.metadata.generated";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { BookingStatus } from "@calcom/prisma/enums";
import {
  getBooker,
  TestData,
  getOrganizer,
  createBookingScenario,
  getScenarioData,
  mockSuccessfulVideoMeetingCreation,
  BookingLocations,
  getDate,
  getMockBookingAttendee,
} from "@calcom/web/test/utils/bookingScenario/bookingScenario";
import { createMockNextJsRequest } from "@calcom/web/test/utils/bookingScenario/createMockNextJsRequest";
import { getMockRequestDataForBooking } from "@calcom/web/test/utils/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/web/test/utils/bookingScenario/setupAndTeardown";

import * as handleSeatsModule from "../handleSeats";

describe("handleSeats", () => {
  setupAndTeardown();

  describe("Correct parameters being passed into handleSeats from handleNewBooking", () => {
    vi.mock("./handleSeats");
    test("On new booking handleSeats is not called", async () => {
      const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;
      const spy = vi.spyOn(handleSeatsModule, "default");
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
      });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
              seatsPerTimeSlot: 3,
            },
          ],
          organizer,
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-1`,
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
        },
      });

      const { req } = createMockNextJsRequest({
        method: "POST",
        body: mockBookingData,
      });

      await handleNewBooking(req);

      expect(spy).toHaveBeenCalledTimes(0);
    });

    test("handleSeats is called when a new attendee is added", async () => {
      const spy = vi.spyOn(handleSeatsModule, "default");
      const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const bookingStartTime = `${plus1DateString}T04:00:00Z`;
      const bookingUid = "abc123";

      const bookingScenario = await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slug: "seated-event",
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
              seatsPerTimeSlot: 3,
              seatsShowAttendees: false,
            },
          ],
          bookings: [
            {
              uid: bookingUid,
              eventTypeId: 1,
              status: BookingStatus.ACCEPTED,
              startTime: bookingStartTime,
              endTime: `${plus1DateString}T05:15:00.000Z`,
              metadata: {
                videoCallUrl: "https://existing-daily-video-call-url.example.com",
              },
              references: [
                {
                  type: appStoreMetadata.dailyvideo.type,
                  uid: "MOCK_ID",
                  meetingId: "MOCK_ID",
                  meetingPassword: "MOCK_PASS",
                  meetingUrl: "http://mock-dailyvideo.example.com",
                  credentialId: null,
                },
              ],
            },
          ],
          organizer,
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-1`,
        },
      });

      const reqBookingUser = "seatedAttendee";

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
          bookingUid: bookingUid,
          user: reqBookingUser,
        },
      });

      const { req } = createMockNextJsRequest({
        method: "POST",
        body: mockBookingData,
      });

      await handleNewBooking(req);

      const handleSeatsCall = spy.mock.calls[0][0];

      expect(handleSeatsCall).toEqual(
        expect.objectContaining({
          bookerEmail: booker.email,
          reqBookingUid: bookingUid,
          reqBodyUser: reqBookingUser,
          tAttendees: expect.any(Function),
          additionalNotes: expect.anything(),
          noEmail: undefined,
        })
      );

      const bookingScenarioEventType = bookingScenario.eventTypes[0];
      expect(handleSeatsCall.eventTypeInfo).toEqual(
        expect.objectContaining({
          eventTitle: bookingScenarioEventType.title,
          eventDescription: bookingScenarioEventType.description,
          length: bookingScenarioEventType.length,
        })
      );

      expect(handleSeatsCall.eventType).toEqual(
        expect.objectContaining({
          id: bookingScenarioEventType.id,
          slug: bookingScenarioEventType.slug,
          workflows: bookingScenarioEventType.workflows,
          seatsPerTimeSlot: bookingScenarioEventType.seatsPerTimeSlot,
          seatsShowAttendees: bookingScenarioEventType.seatsShowAttendees,
        })
      );

      expect(handleSeatsCall.evt).toEqual(
        expect.objectContaining({
          startTime: bookingStartTime,
        })
      );

      expect(handleSeatsCall.invitee).toEqual([
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
      ]);
    });

    test("handleSeats is called on rescheduling a seated event", async () => {
      const spy = vi.spyOn(handleSeatsModule, "default");
      const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const bookingStartTime = `${plus1DateString}T04:00:00Z`;
      const bookingUid = "abc123";

      const bookingScenario = await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slug: "seated-event",
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
              seatsPerTimeSlot: 3,
              seatsShowAttendees: false,
            },
          ],
          bookings: [
            {
              uid: bookingUid,
              eventTypeId: 1,
              status: BookingStatus.ACCEPTED,
              startTime: bookingStartTime,
              endTime: `${plus1DateString}T05:15:00.000Z`,
              metadata: {
                videoCallUrl: "https://existing-daily-video-call-url.example.com",
              },
              references: [
                {
                  type: appStoreMetadata.dailyvideo.type,
                  uid: "MOCK_ID",
                  meetingId: "MOCK_ID",
                  meetingPassword: "MOCK_PASS",
                  meetingUrl: "http://mock-dailyvideo.example.com",
                  credentialId: null,
                },
              ],
            },
          ],
          organizer,
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-1`,
        },
      });

      const reqBookingUser = "seatedAttendee";

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          rescheduleUid: bookingUid,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
          bookingUid: bookingUid,
          user: reqBookingUser,
        },
      });

      const { req } = createMockNextJsRequest({
        method: "POST",
        body: mockBookingData,
      });

      await handleNewBooking(req);

      const handleSeatsCall = spy.mock.calls[0][0];

      expect(handleSeatsCall).toEqual(
        expect.objectContaining({
          rescheduleUid: bookingUid,
          bookerEmail: booker.email,
          reqBookingUid: bookingUid,
          reqBodyUser: reqBookingUser,
          tAttendees: expect.any(Function),
          additionalNotes: expect.anything(),
          noEmail: undefined,
        })
      );

      const bookingScenarioEventType = bookingScenario.eventTypes[0];
      expect(handleSeatsCall.eventTypeInfo).toEqual(
        expect.objectContaining({
          eventTitle: bookingScenarioEventType.title,
          eventDescription: bookingScenarioEventType.description,
          length: bookingScenarioEventType.length,
        })
      );

      expect(handleSeatsCall.eventType).toEqual(
        expect.objectContaining({
          id: bookingScenarioEventType.id,
          slug: bookingScenarioEventType.slug,
          workflows: bookingScenarioEventType.workflows,
          seatsPerTimeSlot: bookingScenarioEventType.seatsPerTimeSlot,
          seatsShowAttendees: bookingScenarioEventType.seatsShowAttendees,
        })
      );

      expect(handleSeatsCall.evt).toEqual(
        expect.objectContaining({
          startTime: bookingStartTime,
        })
      );

      expect(handleSeatsCall.invitee).toEqual([
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
      ]);
    });
  });

  describe("As an attendee", () => {
    describe("Creating a new booking", () => {
      test("Attendee should be added to existing seated event", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const booker = getBooker({
          email: "seat2@example.com",
          name: "Seat 2",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const bookingUid = "abc123";
        const bookingId = 1;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: bookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: `${plus1DateString}T05:15:00.000Z`,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        await handleNewBooking(req);

        const newAttendee = await prismaMock.attendee.findFirst({
          where: {
            email: booker.email,
            bookingId: bookingId,
          },
          include: {
            bookingSeat: true,
          },
        });

        // Check for the existence of the new attendee w/ booking seat
        expect(newAttendee?.bookingSeat).toEqual(
          expect.objectContaining({
            referenceUid: expect.any(String),
            data: expect.any(Object),
            bookingId: 1,
          })
        );
      });

      test("If attendee is already a part of the booking then throw an error", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const booker = getBooker({
          email: "seat1@example.com",
          name: "Seat 1",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const bookingUid = "abc123";
        const bookingId = 1;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: bookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: `${plus1DateString}T05:15:00.000Z`,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@example.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        await expect(() => handleNewBooking(req)).rejects.toThrowError(ErrorCode.AlreadySignedUpForBooking);
      });

      test("If event is already full, fail", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const booker = getBooker({
          email: "seat3@example.com",
          name: "Seat 3",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const bookingUid = "abc123";
        const bookingId = 1;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: bookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 2,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: `${plus1DateString}T05:15:00.000Z`,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        await expect(() => handleNewBooking(req)).rejects.toThrowError(ErrorCode.BookingSeatsFull);
      });
    });

    describe("Rescheduling a booking", () => {
      test("When rescheduling to an existing booking, move attendee", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",

          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const firstBookingUid = "abc123";
        const firstBookingId = 1;

        const secondBookingUid = "def456";
        const secondBookingId = 2;
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T05:15:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: firstBookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  attendeeToReschedule,
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: `${plus2DateString}T05:15:00.000Z`,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        await handleNewBooking(req);

        // Ensure that the attendee is no longer a part of the old booking
        const oldBookingAttendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: firstBookingId,
          },
          select: {
            id: true,
          },
        });

        expect(oldBookingAttendees).not.toContain({ id: attendeeToReschedule.id });
        expect(oldBookingAttendees).toHaveLength(1);

        // Ensure that the attendee is a part of the new booking
        const newBookingAttendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: secondBookingId,
          },
          select: {
            email: true,
          },
        });

        expect(newBookingAttendees).toContainEqual({ email: attendeeToReschedule.email });
        expect(newBookingAttendees).toHaveLength(2);

        // Ensure that the attendeeSeat is also updated to the new booking
        const attendeeSeat = await prismaMock.bookingSeat.findFirst({
          where: {
            attendeeId: attendeeToReschedule.id,
          },
          select: {
            bookingId: true,
          },
        });

        expect(attendeeSeat?.bookingId).toEqual(secondBookingId);
      });

      test("When rescheduling to an empty timeslot, create a new booking", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",

          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const firstBookingUid = "abc123";
        const firstBookingId = 1;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T05:15:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: firstBookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  attendeeToReschedule,
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        const createdBooking = await handleNewBooking(req);

        // Ensure that the attendee is no longer a part of the old booking
        const oldBookingAttendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: firstBookingId,
          },
          select: {
            id: true,
          },
        });

        expect(oldBookingAttendees).not.toContain({ id: attendeeToReschedule.id });
        expect(oldBookingAttendees).toHaveLength(1);

        expect(createdBooking.id).not.toEqual(firstBookingId);

        // Ensure that the attendee and bookingSeat is also updated to the new booking
        const attendee = await prismaMock.attendee.findFirst({
          where: {
            bookingId: createdBooking.id,
          },
          include: {
            bookingSeat: true,
          },
        });

        expect(attendee?.bookingSeat?.bookingId).toEqual(createdBooking.id);
      });

      test("When last attendee is rescheduled, delete old booking", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",

          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const firstBookingUid = "abc123";
        const firstBookingId = 1;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T05:15:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: firstBookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [attendeeToReschedule],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        const createdBooking = await handleNewBooking(req);

        // Ensure that the old booking is cancelled
        const oldBooking = await prismaMock.booking.findFirst({
          where: {
            id: firstBookingId,
          },
          select: {
            status: true,
          },
        });

        expect(oldBooking?.status).toEqual(BookingStatus.CANCELLED);

        // Ensure that the attendee and attendeeSeat is also updated to the new booking
        const attendeeSeat = await prismaMock.attendee.findFirst({
          where: {
            bookingId: createdBooking.id,
          },
          include: {
            bookingSeat: true,
          },
        });

        expect(attendeeSeat?.bookingSeat?.bookingId).toEqual(createdBooking.id);
      });
    });
  });

  describe("As an owner", () => {
    describe("Rescheduling a booking", () => {
      test("When rescheduling to new timeslot, ensure all attendees are moved", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const booker = getBooker({
          email: "booker@example.com",
          name: "Booker",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00.000Z`;
        const firstBookingUid = "abc123";
        const firstBookingId = 1;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T05:15:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: firstBookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        req.userId = organizer.id;

        const rescheduledBooking = await handleNewBooking(req);

        // Ensure that the booking has been moved
        expect(rescheduledBooking?.startTime).toEqual(secondBookingStartTime);
        expect(rescheduledBooking?.endTime).toEqual(secondBookingEndTime);

        // Ensure that the attendees are still a part of the event
        const attendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(attendees).toHaveLength(3);

        // Ensure that the bookingSeats are still a part of the event
        const bookingSeats = await prismaMock.bookingSeat.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(bookingSeats).toHaveLength(3);
      });

      test("When rescheduling to existing booking, merge attendees ", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const booker = getBooker({
          email: "booker@example.com",
          name: "Booker",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00.00Z`;
        const firstBookingUid = "abc123";
        const firstBookingId = 1;

        const secondBookingUid = "def456";
        const secondBookingId = 2;
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00.000Z`;
        const secondBookingEndTime = `${plus2DateString}T05:15:00.000Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: firstBookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 4,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 4,
                    name: "Seat 4",
                    email: "seat4@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-4",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        req.userId = organizer.id;

        const rescheduledBooking = await handleNewBooking(req);

        // Ensure that the booking has been moved
        expect(rescheduledBooking?.startTime).toEqual(new Date(secondBookingStartTime));
        expect(rescheduledBooking?.endTime).toEqual(new Date(secondBookingEndTime));

        // Ensure that the attendees are still a part of the event
        const attendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(attendees).toHaveLength(4);

        // Ensure that the bookingSeats are still a part of the event
        const bookingSeats = await prismaMock.bookingSeat.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(bookingSeats).toHaveLength(4);

        // Ensure that the previous booking has been canceled
        const originalBooking = await prismaMock.booking.findFirst({
          where: {
            id: firstBookingId,
          },
          select: {
            status: true,
          },
        });

        expect(originalBooking?.status).toEqual(BookingStatus.CANCELLED);
      });
      test("When merging more attendees than seats, fail ", async () => {
        const handleNewBooking = (await import("@calcom/features/bookings/lib/handleNewBooking")).default;

        const booker = getBooker({
          email: "booker@example.com",
          name: "Booker",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00.00Z`;
        const firstBookingUid = "abc123";
        const firstBookingId = 1;

        const secondBookingUid = "def456";
        const secondBookingId = 2;
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T05:15:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: firstBookingId,
                slug: "seated-event",
                slotInterval: 45,
                length: 45,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: 1,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 4,
                    name: "Seat 4",
                    email: "seat4@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-4",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        req.userId = organizer.id;

        // const rescheduledBooking = await handleNewBooking(req);
        await expect(() => handleNewBooking(req)).rejects.toThrowError(ErrorCode.NotEnoughAvailableSeats);
      });
    });
  });
});
