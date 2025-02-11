import {Bezier} from "./bezierjs/bezier.js";

function normalizePath(segments) {
    let cursor = [0, 0];
    let last_open = [0, 0];

    function normalizeSegment(segment) {
        switch (segment.command) {
            case "h":
                return normalizeSegment({
                    ...segment,
                    command: "H",
                    parts: [cursor[0] + segment.parts[0]]
                });
            case "H":
                return normalizeSegment({
                    ...segment,
                    command: "L",
                    parts: [segment.parts[0], cursor[1]]
                });
            case "v":
                return normalizeSegment({
                    ...segment,
                    command: "V",
                    parts: [cursor[1] + segment.parts[0]]
                });
            case "V":
                return normalizeSegment({
                    ...segment,
                    command: "L",
                    parts: [cursor[0], segment.parts[0]]
                });
            case "z":
            case "Z":
                return normalizeSegment({
                    ...segment,
                    command: "L",
                    parts: [...last_open]
                });
            case "l":
            case "m":
            case "q":
            case "c":
            case "s":
            case "t":
                return normalizeSegment({
                    ...segment,
                    command: segment.command.toUpperCase(),
                    parts: segment.parts.map((p, i) =>
                        p + cursor[i % 2]
                    )
                });
            default:
                return segment;
        }
    }

    return segments.map(s => {
        const next = normalizeSegment(s);
        cursor = next.parts.slice(-2);
        if (next.command === "M")
            last_open = [...cursor];
        return next;
    });
}

function parallel(p1, p2, distance) {
    if (p1[0] === p2[0]) {
        return [
            [[p1[0] - distance, p1[1]], [p2[0] - distance, p2[1]]],
            [[p1[0] + distance, p1[1]], [p2[0] + distance, p2[1]]]
        ]
    }
    const v = [p2[0] - p1[0], p2[1] - p1[1]];
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    const u = [v[0] / length, v[1] / length];
    const w = p1[0] === p2[0] ? [0, 1] : [-u[1], u[0]];

    const p1_new1 = [p1[0] + distance * w[0], p1[1] + distance * w[1]];
    const p2_new1 = [p2[0] + distance * w[0], p2[1] + distance * w[1]];
    const p1_new2 = [p1[0] - distance * w[0], p1[1] - distance * w[1]];
    const p2_new2 = [p2[0] - distance * w[0], p2[1] - distance * w[1]];
    return [
        [p1_new1, p2_new1],
        [p1_new2, p2_new2]
    ];
}

function fromBezier(b) {
    return b.points.map(({x, y}) => [x,y])
}

function analyzePath(path, [t, r, b, l], [tt, tr, tb, tl]) {
    const segments = path.match(/([A-Za-z])(\s*[-\d]+){0,6}/g);
    const segment_data = normalizePath(segments.map((segment) => {
        const [command, ...parts] = segment.split(" ").map((p, i) => i ? parseFloat(p) : p);
        return {
            command,
            parts,
            segment
        }
    }));

    segment_data.forEach((segment, i) => {
        segment.end = segment.parts.slice(-2).map(n => +n);
    });

    segment_data.splice(0, 1);

    function parallelSegments(p1, p2, distance) {
        if (p1[0] === p2[0]) {
            return {
                m: Infinity,
                b0: p1[0],
                b1: p1[0] - distance,
                b2: p1[0] + distance
            };
        }
        const [
            [p1_new1, p1_new2],
            [p2_new1, p2_new2]
        ] = parallel(p1, p2, distance);
        const m = (p2[1] - p1[1]) / (p2[0] - p1[0]);
        const b0 = p1[1] - m * p1[0];
        let b1 = p1_new1[1] - m * p1_new1[0];
        let b2 = p2_new2[1] - m * p2_new2[0];
        return {
            m,
            b0,
            b1,
            b2
        };
    }

    function intersection(m0, b0, m1, b1) {
        const x = m0 === Infinity ? b0 : m1 === Infinity ? b1 : (b1 - b0) / (m0 - m1);
        const y = m0 === Infinity ? m1 * x + b1 : m0 * x + b0;
        return [x, y];
    }

    function slope([x0, y0], [x1, y1]) {
        if (x0 === x1)
            return Infinity;
        return (y1 - y0) / (x1 - x0);
    }

    function intersect_segments(s0, s1) {
        const m0 = slope(...s0);
        const m1 = slope(...s1);
        const b0 = m0 === Infinity ? s0[0][0] : s0[0][1] - m0 * s0[0][0];
        const b1 = m1 === Infinity ? s1[0][0] : s1[0][1] - m1 * s1[0][0];
        return intersection(m0, b0, m1, b1)
    }

    const strokes = {
        top: t,
        right: r,
        bottom: b,
        left: l
    };
    const colors = {
        top: tt,
        right: tr,
        bottom: tb,
        left: tl
    };
    segment_data.forEach((segment, i) => {
        segment.next = segment_data[(i + 1) % segment_data.length];
        segment.prev = segment_data[(i - 1 + segment_data.length) % segment_data.length];
        segment.end = segment.parts.slice(-2).map(parseFloat);
    });

    segment_data.forEach((segment, i) => {
        segment.start = segment.prev.end;
        const [x0, y0] = segment.start.map(parseFloat);
        const [x1, y1] = segment.end.map(parseFloat);
        segment.control = segment.parts.slice(0, -2).map(parseFloat);
        if (segment.end[0] === segment.start[0]) {
            segment.side = y1 > y0 ? "right" : "left";
            segment.sope = Infinity;
        } else {
            segment.slope = (segment.end[1] - segment.start[1]) / (segment.end[0] - segment.start[0]);
            segment.side = Math.abs(segment.slope) >= 1 ?
                (y1 > y0 ? "right" : "left") :
                (x1 > x0 ? "top" : "bottom");
        }
        segment.stroke = Math.max(0, strokes[segment.side]);
        segment.color = colors[segment.side];
        segment.halfStroke = segment.stroke / 2;
        segment.parallel_mid = parallelSegments(segment.start, segment.end, segment.halfStroke);
        if (segment.control.length) {
            segment.bezier = new Bezier(x0, y0, ...segment.control, x1, y1);
            segment.tan_start_slope = (segment.control[1] - segment.start[1]) / (segment.control[0] - segment.start[0]);
            segment.tan_end_slope = (segment.end[1] - segment.control.at(-1)) / (segment.end[0] - segment.control.at(-2));
            segment.outline_inner = segment.bezier.offset(segment.halfStroke).map(fromBezier);
            segment.outline_outer = segment.bezier.offset(-segment.halfStroke).map(fromBezier);
        } else {
            segment.outline = parallel(segment.start, segment.end, segment.halfStroke);
            segment.outline_inner = [segment.outline[0]]
            segment.outline_outer = [segment.outline[1]]
        }
    });

    segment_data.forEach(segment => {
        segment.next_outline_inner_start = segment.next.outline_inner[0].slice(0, 2);
        segment.next_outline_outer_start = segment.next.outline_outer[0].slice(0, 2);
        segment.outline_inner_end = segment.outline_inner.at(-1).slice(-2);
        segment.outline_outer_end = segment.outline_outer.at(-1).slice(-2);
        segment.adjusted_inner_end = intersect_segments(segment.outline_inner_end, segment.next_outline_inner_start);
        segment.adjusted_outer_end = intersect_segments(segment.outline_outer_end, segment.next_outline_outer_start);
    });

    return segment_data;
}
function render() {
    const path = pathInput.value;
    refPath.setAttribute("d", path)
    ref.style.borderLeftWidth = `${leftInput.value}px`;
    ref.style.borderTopWidth = `${topInput.value}px`;
    ref.style.borderRightWidth = `${rightInput.value}px`;
    ref.style.borderBottomWidth = `${bottomInput.value}px`;
    ref.style.borderLeftColor = leftColorInput.value;
    ref.style.borderTopColor = topColorInput.value;
    ref.style.borderRightColor = rightColorInput.value;
    ref.style.borderBottomColor = bottomColorInput.value;
    const segments = analyzePath(path,
        [+topInput.value, +rightInput.value, +bottomInput.value, +leftInput.value],
        [topColorInput.value, rightColorInput.value, bottomColorInput.value, leftColorInput.value]);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.beginPath();
    ctx.moveTo(...segments.at(segments.length - 1).adjusted_outer_end);
    segments.forEach((segment, i) => {
        ctx.fillStyle = segment.color;
        ctx.beginPath();
        ctx.moveTo(...segment.prev.adjusted_outer_end);
        segment.outline_outer[0][0] = segment.prev.adjusted_outer_end;
        segment.outline_inner[0][0] = segment.prev.adjusted_inner_end;
        segment.outline_outer.at(-1).splice(-1, 1, segment.adjusted_outer_end);
        segment.outline_inner.at(-1).splice(-1, 1, segment. adjusted_inner_end);
        if (segment.command === "L")
            ctx.lineTo(...segment.adjusted_outer_end);
        else {
            for (const subpath of segment.outline_outer) {
                if (subpath.length === 4)
                    ctx.bezierCurveTo(...subpath.slice(1).flat());
                else
                    ctx.quadraticCurveTo(...subpath.slice(1).flat());
            }
        }
        ctx.lineTo(...segment.adjusted_inner_end);
        if (segment.command === "L") {
            ctx.lineTo(...segment.prev.adjusted_inner_end)
        } else {
            for (const subpath of segment.outline_inner.toReversed()) {
                if (subpath.length === 4)
                    ctx.bezierCurveTo(...subpath.toReversed().slice(1).flat());
                else
                    ctx.quadraticCurveTo(...subpath.toReversed().slice(1).flat());
            }
        }
        ctx.closePath();
        ctx.fill();
    });
}

form.onchange = () => form.submit();
for (const [name, value] of new URLSearchParams(location.search)) {
    form.elements[name].value = value;
}
render()