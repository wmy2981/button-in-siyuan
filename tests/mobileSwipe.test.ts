import {describe, expect, it, vi} from "vitest";
import {bindMobileSwipe} from "../src/mobileSwipe";
import {touchEvent} from "./helpers";

const setup = () => {
    const element = document.createElement("div");
    const forwardTo = document.createElement("div");
    document.body.append(element, forwardTo);
    const onSwipe = vi.fn();
    const forwarded: Array<{type: string; event: TouchEvent}> = [];
    ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((type) => {
        forwardTo.addEventListener(type, (event) => forwarded.push({type, event: event as TouchEvent}));
    });
    const unbind = bindMobileSwipe({element, forwardTo, onSwipe});
    const start = (x: number, y: number) =>
        element.dispatchEvent(touchEvent("touchstart", [{clientX: x, clientY: y}], [{clientX: x, clientY: y}]));
    const move = (x: number, y: number) =>
        element.dispatchEvent(touchEvent("touchmove", [{clientX: x, clientY: y}], [{clientX: x, clientY: y}]));
    const end = (x: number, y: number) =>
        element.dispatchEvent(touchEvent("touchend", [], [{clientX: x, clientY: y}]));
    return {element, forwardTo, onSwipe, forwarded, unbind, start, move, end};
};

describe("bindMobileSwipe", () => {
    it("forwards a horizontal swipe to the host element", () => {
        const {onSwipe, forwarded, start, move} = setup();
        start(100, 100);
        move(140, 105);
        expect(onSwipe).toHaveBeenCalledTimes(1);
        expect(forwarded.map((item) => item.type)).toEqual(["touchstart", "touchmove"]);
        expect(forwarded[0].event.touches[0].clientX).toBe(100);
        expect(forwarded[0].event.touches[0].clientY).toBe(100);
        expect(forwarded[1].event.touches[0].clientX).toBe(140);
        expect(forwarded[1].event.touches[0].clientY).toBe(105);
    });

    it("forwards a swipe to the left as well", () => {
        const {onSwipe, forwarded, start, move} = setup();
        start(200, 100);
        move(150, 100);
        expect(onSwipe).toHaveBeenCalledTimes(1);
        expect(forwarded.map((item) => item.type)).toEqual(["touchstart", "touchmove"]);
    });

    it("waits for the activation distance", () => {
        const {onSwipe, forwarded, start, move} = setup();
        start(100, 100);
        move(111, 100);
        expect(onSwipe).not.toHaveBeenCalled();
        expect(forwarded).toHaveLength(0);
        move(112, 100);
        expect(onSwipe).toHaveBeenCalledTimes(1);
    });

    it("does not forward a vertical gesture", () => {
        const {onSwipe, forwarded, start, move} = setup();
        start(100, 100);
        move(105, 160);
        expect(onSwipe).not.toHaveBeenCalled();
        expect(forwarded).toHaveLength(0);
    });

    it("does not forward a mostly-vertical diagonal gesture", () => {
        const {onSwipe, forwarded, start, move} = setup();
        start(100, 100);
        move(130, 140);
        expect(onSwipe).not.toHaveBeenCalled();
        expect(forwarded).toHaveLength(0);
    });

    it("ignores a multi-finger start", () => {
        const {onSwipe, forwarded, element} = setup();
        element.dispatchEvent(touchEvent("touchstart", [{clientX: 0, clientY: 0}, {clientX: 10, clientY: 10}]));
        element.dispatchEvent(touchEvent("touchmove", [{clientX: 100, clientY: 0}, {clientX: 110, clientY: 0}]));
        expect(onSwipe).not.toHaveBeenCalled();
        expect(forwarded).toHaveLength(0);
    });

    it("sends touchcancel when the gesture turns into a multi-finger one", () => {
        const {forwarded, start, move, element} = setup();
        start(100, 100);
        move(150, 100);
        expect(forwarded.map((item) => item.type)).toEqual(["touchstart", "touchmove"]);

        element.dispatchEvent(touchEvent("touchmove", [{clientX: 160, clientY: 100}, {clientX: 170, clientY: 100}]));
        expect(forwarded.map((item) => item.type)).toEqual(["touchstart", "touchmove", "touchcancel"]);
    });

    it("forwards touchend with the last position", () => {
        const {forwarded, start, move, end} = setup();
        start(100, 100);
        move(140, 100);
        end(150, 110);
        const endEvent = forwarded.at(-1);
        expect(endEvent?.type).toBe("touchend");
        expect(endEvent?.event.touches).toHaveLength(0);
        expect(endEvent?.event.changedTouches[0].clientX).toBe(150);
        expect(endEvent?.event.changedTouches[0].clientY).toBe(110);
    });

    it("forwards touchcancel when the browser cancels the gesture", () => {
        const {forwarded, start, move, element} = setup();
        start(100, 100);
        move(140, 100);
        element.dispatchEvent(touchEvent("touchcancel", [], [{clientX: 140, clientY: 100}]));
        expect(forwarded.at(-1)?.type).toBe("touchcancel");
    });

    it("does not forward a cancelled gesture that never started forwarding", () => {
        const {forwarded, start, element} = setup();
        start(100, 100);
        element.dispatchEvent(touchEvent("touchcancel", [], [{clientX: 100, clientY: 100}]));
        expect(forwarded).toHaveLength(0);
    });

    it("does not forward the end of a gesture that was never tracked", () => {
        const {forwarded, end} = setup();
        end(100, 100);
        expect(forwarded).toHaveLength(0);
    });

    it("keeps the original touch target in the synthetic events", () => {
        const {forwarded, move, element} = setup();
        const child = document.createElement("button");
        element.append(child);
        child.dispatchEvent(touchEvent("touchstart", [{clientX: 100, clientY: 100}], [{clientX: 100, clientY: 100}]));
        move(150, 100);
        expect(forwarded[0].event.touches[0].target).toBe(child);
    });

    it("only calls onSwipe once per gesture", () => {
        const {onSwipe, start, move} = setup();
        start(100, 100);
        move(140, 100);
        move(180, 100);
        move(220, 100);
        expect(onSwipe).toHaveBeenCalledTimes(1);
    });

    it("resets the tracking after a gesture", () => {
        const {onSwipe, start, move, end} = setup();
        start(100, 100);
        move(140, 100);
        end(140, 100);
        start(200, 200);
        move(240, 200);
        expect(onSwipe).toHaveBeenCalledTimes(2);
    });

    it("stops forwarding after cleanup", () => {
        const {onSwipe, forwarded, start, move, unbind} = setup();
        unbind();
        start(100, 100);
        move(160, 100);
        expect(onSwipe).not.toHaveBeenCalled();
        expect(forwarded).toHaveLength(0);
    });

    it("marks the forwarded events as bubbling and cancelable", () => {
        const {forwarded, start, move} = setup();
        start(100, 100);
        move(140, 100);
        expect(forwarded[0].event.bubbles).toBe(true);
        expect(forwarded[0].event.cancelable).toBe(true);
    });
});
