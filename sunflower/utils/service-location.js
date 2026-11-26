function coordinate(value) {
    return value === null || value === undefined || value === '' ? NaN : Number(value);
}

function distanceKm(fromLat, fromLng, toLat, toLng) {
    const [a, b, c, d] = [fromLat, fromLng, toLat, toLng].map(coordinate);
    if (![a, b, c, d].every(Number.isFinite) ||
        Math.abs(a) > 90 || Math.abs(c) > 90 || Math.abs(b) > 180 || Math.abs(d) > 180 ||
        (a === 0 && b === 0) || (c === 0 && d === 0)) return null;
    const rad = Math.PI / 180;
    const hav = Math.sin((c - a) * rad / 2) ** 2 +
        Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, hav)));
}

function locationFromQuery(query) {
    try {
        const raw = query.place || 'null';
        const place = JSON.parse(raw.startsWith('%') ? decodeURIComponent(raw) : raw);
        if (place && typeof place.name === 'string' && typeof place.address === 'string' &&
            distanceKm(place.latitude, place.longitude, place.latitude, place.longitude) !== null) return place;
    } catch (error) {
        // 链接中的地点参数无效时，由预约页重新选点。
    }
    return null;
}

function choosePlace(onSelected) {
    wx.chooseLocation({
        success: onSelected,
        fail(error) {
            if (!/cancel/i.test(error.errMsg || '')) {
                wx.showToast({ title: '地图选点失败，请检查定位权限', icon: 'none' });
            }
        },
    });
}

module.exports = { distanceKm, locationFromQuery, choosePlace };
