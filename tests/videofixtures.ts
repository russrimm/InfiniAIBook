/** The smallest thing that passes for an MP4: a box whose type is "ftyp", then padding. */
export const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(32, 1)]);
