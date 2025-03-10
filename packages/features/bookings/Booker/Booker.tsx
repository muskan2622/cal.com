import { LazyMotion, m, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useMemo } from "react";
import StickyBox from "react-sticky-box";
import { shallow } from "zustand/shallow";

import BookingPageTagManager from "@calcom/app-store/BookingPageTagManager";
import dayjs from "@calcom/dayjs";
import { getQueryParam } from "@calcom/features/bookings/Booker/utils/query-param";
import { useNonEmptyScheduleDays } from "@calcom/features/schedules";
import classNames from "@calcom/lib/classNames";
import { DEFAULT_LIGHT_BRAND_COLOR, DEFAULT_DARK_BRAND_COLOR } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { BookerLayouts } from "@calcom/prisma/zod-utils";

import { VerifyCodeDialog } from "../components/VerifyCodeDialog";
import { AvailableTimeSlots } from "./components/AvailableTimeSlots";
import { BookEventForm } from "./components/BookEventForm";
import { BookFormAsModal } from "./components/BookEventForm/BookFormAsModal";
import { EventMeta } from "./components/EventMeta";
import { HavingTroubleFindingTime } from "./components/HavingTroubleFindingTime";
import { Header } from "./components/Header";
import { InstantBooking } from "./components/InstantBooking";
import { LargeCalendar } from "./components/LargeCalendar";
import { OverlayCalendar } from "./components/OverlayCalendar/OverlayCalendar";
import { RedirectToInstantMeetingModal } from "./components/RedirectToInstantMeetingModal";
import { BookerSection } from "./components/Section";
import { Away, NotFound } from "./components/Unavailable";
import { fadeInLeft, getBookerSizeClassNames, useBookerResizeAnimation } from "./config";
import { useBookerStore } from "./store";
import type { BookerProps, WrappedBookerProps } from "./types";
import { useBrandColors } from "./utils/use-brand-colors";

const loadFramerFeatures = () => import("./framer-features").then((res) => res.default);
const PoweredBy = dynamic(() => import("@calcom/ee/components/PoweredBy"));
const UnpublishedEntity = dynamic(() =>
  import("@calcom/ui/components/unpublished-entity/UnpublishedEntity").then((mod) => mod.UnpublishedEntity)
);
const DatePicker = dynamic(() => import("./components/DatePicker").then((mod) => mod.DatePicker), {
  ssr: false,
});

const BookerComponent = ({
  username,
  eventSlug,
  hideBranding = false,
  entity,
  isInstantMeeting = false,
  onGoBackInstantMeeting,
  onConnectNowInstantMeeting,
  onOverlayClickNoCalendar,
  onClickOverlayContinue,
  onOverlaySwitchStateChange,
  sessionUsername,
  isRedirect,
  fromUserNameRedirected,
  rescheduleUid,
  hasSession,
  extraOptions,
  bookings,
  verifyEmail,
  slots,
  calendars,
  bookerForm,
  event,
  bookerLayout,
  schedule,
  verifyCode,
}: BookerProps & WrappedBookerProps) => {
  const [bookerState, setBookerState] = useBookerStore((state) => [state.state, state.setState], shallow);
  const selectedDate = useBookerStore((state) => state.selectedDate);
  const {
    shouldShowFormInDialog,
    hasDarkBackground,
    extraDays,
    columnViewExtraDays,
    isMobile,
    layout,
    hideEventTypeDetails,
    isEmbed,
    bookerLayouts,
  } = bookerLayout;

  const [seatedEventData, setSeatedEventData] = useBookerStore(
    (state) => [state.seatedEventData, state.setSeatedEventData],
    shallow
  );
  const { selectedTimeslot, setSelectedTimeslot } = slots;

  const [dayCount, setDayCount] = useBookerStore((state) => [state.dayCount, state.setDayCount], shallow);

  const nonEmptyScheduleDays = useNonEmptyScheduleDays(schedule?.data?.slots).filter(
    (slot) => dayjs(selectedDate).diff(slot, "day") <= 0
  );
  const totalWeekDays = 7;
  const addonDays =
    nonEmptyScheduleDays.length < extraDays
      ? (extraDays - nonEmptyScheduleDays.length + 1) * totalWeekDays
      : nonEmptyScheduleDays.length === extraDays
      ? totalWeekDays
      : 0;
  // Taking one more available slot(extraDays + 1) to calculate the no of days in between, that next and prev button need to shift.
  const availableSlots = nonEmptyScheduleDays.slice(0, extraDays + 1);
  if (nonEmptyScheduleDays.length !== 0)
    columnViewExtraDays.current =
      Math.abs(dayjs(selectedDate).diff(availableSlots[availableSlots.length - 2], "day")) + addonDays;

  const nextSlots =
    Math.abs(dayjs(selectedDate).diff(availableSlots[availableSlots.length - 1], "day")) + addonDays;

  const animationScope = useBookerResizeAnimation(layout, bookerState);

  const timeslotsRef = useRef<HTMLDivElement>(null);
  const StickyOnDesktop = isMobile ? "div" : StickyBox;

  const { t } = useLocale();

  useBrandColors({
    brandColor: event.data?.profile.brandColor ?? DEFAULT_LIGHT_BRAND_COLOR,
    darkBrandColor: event.data?.profile.darkBrandColor ?? DEFAULT_DARK_BRAND_COLOR,
    theme: event.data?.profile.theme,
  });

  const { bookerFormErrorRef, key, formEmail, bookingForm, errors: formErrors } = bookerForm;

  const { handleBookEvent, hasInstantMeetingTokenExpired, errors, loadingStates, expiryTime } = bookings;
  const {
    isEmailVerificationModalVisible,
    setEmailVerificationModalVisible,
    handleVerifyEmail,
    renderConfirmNotVerifyEmailButtonCond,
  } = verifyEmail;

  const {
    overlayBusyDates,
    isOverlayCalendarEnabled,
    connectedCalendars,
    loadingConnectedCalendar,
    onToggleCalendar,
  } = calendars;

  useEffect(() => {
    if (event.isPending) return setBookerState("loading");
    if (!selectedDate) return setBookerState("selecting_date");
    if (!selectedTimeslot) return setBookerState("selecting_time");
    return setBookerState("booking");
  }, [event, selectedDate, selectedTimeslot, setBookerState]);

  const EventBooker = useMemo(() => {
    return bookerState === "booking" ? (
      <BookEventForm
        key={key}
        onCancel={() => {
          setSelectedTimeslot(null);
          if (seatedEventData.bookingUid) {
            setSeatedEventData({ ...seatedEventData, bookingUid: undefined, attendees: undefined });
          }
        }}
        onSubmit={renderConfirmNotVerifyEmailButtonCond ? handleBookEvent : handleVerifyEmail}
        errorRef={bookerFormErrorRef}
        errors={{ ...formErrors, ...errors }}
        loadingStates={loadingStates}
        renderConfirmNotVerifyEmailButtonCond={renderConfirmNotVerifyEmailButtonCond}
        bookingForm={bookingForm}
        eventQuery={event}
        extraOptions={extraOptions}
        rescheduleUid={rescheduleUid}>
        <>
          <VerifyCodeDialog
            isOpenDialog={isEmailVerificationModalVisible}
            setIsOpenDialog={setEmailVerificationModalVisible}
            email={formEmail}
            isUserSessionRequiredToVerify={false}
            verifyCodeWithSessionNotRequired={verifyCode.verifyCodeWithSessionNotRequired}
            verifyCodeWithSessionRequired={verifyCode.verifyCodeWithSessionRequired}
            error={verifyCode.error}
            resetErrors={verifyCode.resetErrors}
            isPending={verifyCode.isPending}
            setIsPending={verifyCode.setIsPending}
          />
          <RedirectToInstantMeetingModal
            expiryTime={expiryTime}
            hasInstantMeetingTokenExpired={hasInstantMeetingTokenExpired}
            bookingId={parseInt(getQueryParam("bookingId") || "0")}
            onGoBack={() => {
              onGoBackInstantMeeting();
            }}
          />
        </>
      </BookEventForm>
    ) : (
      <></>
    );
  }, [
    bookerFormErrorRef,
    bookerState,
    bookingForm,
    errors,
    event,
    expiryTime,
    extraOptions,
    formEmail,
    formErrors,
    handleBookEvent,
    handleVerifyEmail,
    hasInstantMeetingTokenExpired,
    isEmailVerificationModalVisible,
    key,
    loadingStates,
    onGoBackInstantMeeting,
    renderConfirmNotVerifyEmailButtonCond,
    rescheduleUid,
    seatedEventData,
    setEmailVerificationModalVisible,
    setSeatedEventData,
    setSelectedTimeslot,
    verifyCode.error,
    verifyCode.isPending,
    verifyCode.resetErrors,
    verifyCode.setIsPending,
    verifyCode.verifyCodeWithSessionNotRequired,
    verifyCode.verifyCodeWithSessionRequired,
  ]);

  if (entity.isUnpublished) {
    return <UnpublishedEntity {...entity} />;
  }

  if (event.isSuccess && !event.data) {
    return <NotFound />;
  }

  if (bookerState === "loading") {
    return null;
  }

  return (
    <>
      {event.data ? <BookingPageTagManager eventType={event.data} /> : null}

      {bookerState !== "booking" && event.data?.isInstantEvent && (
        <div
          className="animate-fade-in-up fixed bottom-2 z-40 my-2 opacity-0"
          style={{ animationDelay: "1s" }}>
          <InstantBooking
            event={event.data}
            onConnectNow={() => {
              onConnectNowInstantMeeting();
            }}
          />
        </div>
      )}
      <div
        className={classNames(
          // In a popup embed, if someone clicks outside the main(having main class or main tag), it closes the embed
          "main",
          "text-default flex min-h-full w-full flex-col items-center",
          layout === BookerLayouts.MONTH_VIEW ? "overflow-visible" : "overflow-clip"
        )}>
        {/* redirect from other user profile */}
        {isRedirect && (
          <div className="mb-8 rounded-md bg-blue-100 p-4 dark:border dark:bg-transparent">
            <h2 className="text-default mb-2 text-sm font-semibold">
              {t("user_redirect_title", {
                username: fromUserNameRedirected,
              })}{" "}
              🏝️
            </h2>
            <p className="text-default text-sm">
              {t("user_redirect_description", {
                profile: {
                  username: username,
                },
                username: fromUserNameRedirected,
              })}{" "}
              😄
            </p>
          </div>
        )}
        <div
          ref={animationScope}
          className={classNames(
            // Sets booker size css variables for the size of all the columns.
            ...getBookerSizeClassNames(layout, bookerState, hideEventTypeDetails),
            "bg-default dark:bg-muted grid max-w-full items-start dark:[color-scheme:dark] sm:transition-[width] sm:duration-300 sm:motion-reduce:transition-none md:flex-row",
            // We remove border only when the content covers entire viewport. Because in embed, it can almost never be the case that it covers entire viewport, we show the border there
            (layout === BookerLayouts.MONTH_VIEW || isEmbed) && "border-subtle rounded-md border",
            !isEmbed && "sm:transition-[width] sm:duration-300",
            isEmbed && layout === BookerLayouts.MONTH_VIEW && "border-booker sm:border-booker-width",
            !isEmbed && layout === BookerLayouts.MONTH_VIEW && "border-subtle"
          )}>
          <AnimatePresence>
            {!isInstantMeeting && (
              <BookerSection
                area="header"
                className={classNames(
                  layout === BookerLayouts.MONTH_VIEW && "fixed top-4 z-10 ltr:right-4 rtl:left-4",
                  (layout === BookerLayouts.COLUMN_VIEW || layout === BookerLayouts.WEEK_VIEW) &&
                    "bg-default dark:bg-muted sticky top-0 z-10"
                )}>
                <Header
                  isMyLink={Boolean(username === sessionUsername)}
                  eventSlug={eventSlug}
                  enabledLayouts={bookerLayouts.enabledLayouts}
                  extraDays={layout === BookerLayouts.COLUMN_VIEW ? columnViewExtraDays.current : extraDays}
                  isMobile={isMobile}
                  nextSlots={nextSlots}
                  renderOverlay={() =>
                    isEmbed ? (
                      <></>
                    ) : (
                      <>
                        <OverlayCalendar
                          isOverlayCalendarEnabled={isOverlayCalendarEnabled}
                          connectedCalendars={connectedCalendars}
                          loadingConnectedCalendar={loadingConnectedCalendar}
                          overlayBusyDates={overlayBusyDates}
                          onToggleCalendar={onToggleCalendar}
                          hasSession={hasSession}
                          handleClickContinue={onClickOverlayContinue}
                          handleSwitchStateChange={onOverlaySwitchStateChange}
                          handleClickNoCalendar={() => {
                            onOverlayClickNoCalendar();
                          }}
                        />
                      </>
                    )
                  }
                />
              </BookerSection>
            )}
            <StickyOnDesktop
              key="meta"
              className={classNames(
                "relative z-10 flex [grid-area:meta]",
                // Important: In Embed if we make min-height:100vh, it will cause the height to continuously keep on increasing
                layout !== BookerLayouts.MONTH_VIEW && !isEmbed && "sm:min-h-screen"
              )}>
              <BookerSection
                area="meta"
                className="max-w-screen flex w-full flex-col md:w-[var(--booker-meta-width)]">
                <EventMeta event={event.data} isPending={event.isPending} />
                {layout !== BookerLayouts.MONTH_VIEW &&
                  !(layout === "mobile" && bookerState === "booking") && (
                    <div className="mt-auto px-5 py-3 ">
                      <DatePicker event={event} schedule={schedule} />
                    </div>
                  )}
              </BookerSection>
            </StickyOnDesktop>

            <BookerSection
              key="book-event-form"
              area="main"
              className="border-subtle sticky top-0 ml-[-1px] h-full p-6 md:w-[var(--booker-main-width)] md:border-l"
              {...fadeInLeft}
              visible={bookerState === "booking" && !shouldShowFormInDialog}>
              {EventBooker}
            </BookerSection>

            <BookerSection
              key="datepicker"
              area="main"
              visible={bookerState !== "booking" && layout === BookerLayouts.MONTH_VIEW}
              {...fadeInLeft}
              initial="visible"
              className="md:border-subtle ml-[-1px] h-full flex-shrink px-5 py-3 md:border-l lg:w-[var(--booker-main-width)]">
              <DatePicker event={event} schedule={schedule} />
            </BookerSection>

            <BookerSection
              key="large-calendar"
              area="main"
              visible={layout === BookerLayouts.WEEK_VIEW}
              className="border-subtle sticky top-0 ml-[-1px] h-full md:border-l"
              {...fadeInLeft}>
              <LargeCalendar
                extraDays={extraDays}
                schedule={schedule.data}
                isLoading={schedule.isPending}
                event={event}
              />
            </BookerSection>

            <BookerSection
              key="timeslots"
              area={{ default: "main", month_view: "timeslots" }}
              visible={
                (layout !== BookerLayouts.WEEK_VIEW && bookerState === "selecting_time") ||
                layout === BookerLayouts.COLUMN_VIEW
              }
              className={classNames(
                "border-subtle rtl:border-default flex h-full w-full flex-col overflow-x-auto px-5 py-3 pb-0 rtl:border-r ltr:md:border-l",
                layout === BookerLayouts.MONTH_VIEW &&
                  "h-full overflow-hidden md:w-[var(--booker-timeslots-width)]",
                layout !== BookerLayouts.MONTH_VIEW && "sticky top-0"
              )}
              ref={timeslotsRef}
              {...fadeInLeft}>
              <AvailableTimeSlots
                extraDays={extraDays}
                limitHeight={layout === BookerLayouts.MONTH_VIEW}
                schedule={schedule?.data}
                isLoading={schedule.isPending}
                seatsPerTimeSlot={event.data?.seatsPerTimeSlot}
                showAvailableSeatsCount={event.data?.seatsShowAvailabilityCount}
              />
            </BookerSection>
          </AnimatePresence>
        </div>

        <HavingTroubleFindingTime
          visible={bookerState !== "booking" && layout === BookerLayouts.MONTH_VIEW && !isMobile}
          dayCount={dayCount}
          isScheduleLoading={schedule.isLoading}
          onButtonClick={() => {
            setDayCount(null);
          }}
        />

        {!hideBranding && (
          <m.span
            key="logo"
            className={classNames(
              "-z-10 mb-6 mt-auto pt-6 [&_img]:h-[15px]",
              hasDarkBackground ? "dark" : "",
              layout === BookerLayouts.MONTH_VIEW ? "block" : "hidden"
            )}>
            <PoweredBy logoOnly />
          </m.span>
        )}
      </div>

      <BookFormAsModal
        onCancel={() => setSelectedTimeslot(null)}
        visible={bookerState === "booking" && shouldShowFormInDialog}>
        {EventBooker}
      </BookFormAsModal>
    </>
  );
};

export const Booker = (props: BookerProps & WrappedBookerProps) => {
  if (props.isAway) return <Away />;

  return (
    <LazyMotion strict features={loadFramerFeatures}>
      <BookerComponent {...props} />
    </LazyMotion>
  );
};
