"""Bounded preview scenarios; never modify a scene or a live export."""
import copy
import datetime
import re


def scenario_values(scenario, catalogue):
    if not isinstance(scenario, dict) or set(scenario) != {'time', 'date', 'readings', 'weather'}:
        raise ValueError('Choose valid preview values.')
    time, date = scenario['time'], scenario['date']
    if not isinstance(time, str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d:[0-5]\d', time):
        raise ValueError('Choose a valid preview time.')
    if not isinstance(date, str) or not re.fullmatch(r'20\d{2}-\d{2}-\d{2}', date):
        raise ValueError('Choose a preview date from 2000 to 2099.')
    try:
        day = datetime.date.fromisoformat(date)
    except ValueError as failure:
        raise ValueError('Choose a valid preview date.') from failure
    if scenario['readings'] not in ('sample', 'large', 'missing') or scenario['weather'] not in (
            'sample', 'sun', 'cloud', 'cloud-rain', 'cloud-storm', 'snowflake', 'wind', 'mist', 'missing'):
        raise ValueError('Choose valid preview readings and weather.')
    values = {source['id']: copy.deepcopy(source['sample']) for source in catalogue}
    hour, minute, second = time.split(':')
    weekday = ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')[day.weekday()]
    month = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')[day.month - 1]
    values.update(time=f'{hour}:{minute}', timeSeconds=time, hours=hour, minutes=minute, seconds=second,
                  secondsRing=int(second), numericDate=day.strftime('%d/%m/%y'), weekday=weekday,
                  day=f'{day.day:02}', month=month, year=str(day.year), date=f'{weekday} {day.day} {month} {day.year}')
    now = int(hour) * 3600 + int(minute) * 60 + int(second)
    values['solarTimeline'][2] = now
    values['sunriseSunset'] = '07:00' if now < 25200 or now >= 64800 else '18:00'
    if scenario['readings'] == 'large':
        values.update(heartRate='199', steps='99999', floors='999', weeklyWalk='999.9', weeklyRun='999.9',
                      temperature='-20', highLow='40/-20', temperatureHigh='40', temperatureLow='-20',
                      battery='100%', alarms='9 ALARMS', heartZones=199, temperatureZones=-20,
                      bodyBattery='100%', stress='100', recoveryTime='96H 59M', rainChance='100%', wind='199 KM/H WNW')
        for source in ('stepsWeek', 'floorsWeek', 'runWeek', 'walkWeek'):
            values[source] = [99999, 20000, 75000, 30000, 90000, 50000, 99999]
    elif scenario['readings'] == 'missing':
        for source in ('heartRate', 'steps', 'floors', 'weeklyWalk', 'weeklyRun', 'temperature', 'highLow',
                       'temperatureHigh', 'temperatureLow', 'battery', 'alarms', 'sunriseSunset',
                       'bodyBattery', 'stress', 'recoveryTime', 'rainChance', 'wind'):
            values[source] = '--'
        for source in ('stepsWeek', 'floorsWeek', 'runWeek', 'walkWeek'):
            values[source] = [None] * 7
        values.update(heartZones=None, temperatureZones=None, solarTimeline=[None, None, now])
    if scenario['weather'] == 'missing':
        for source in ('temperature', 'highLow', 'temperatureHigh', 'temperatureLow', 'rainChance', 'wind'):
            values[source] = '--'
        values['temperatureZones'] = None
    return values


def scenario_chart_ops(element, values, weather, night, **geometry):
    from designer_activity import icon_ops
    from designer_charts import chart_ops, shade
    source = element['source']
    if source == 'temperatureIcon' and weather != 'sample':
        variant = 'temperature' if weather == 'missing' else weather
        return [{**operation, 'colour': element['nightColour' if night else 'colour']}
                for operation in icon_ops(element, variant)]
    if source == 'sunriseSunsetIcon':
        timeline = values['solarTimeline']
        sunrise, sunset, now = timeline
        variant = 'sunrise' if sunrise is None or now < sunrise or now >= sunset else 'sunset'
        return [{**operation, 'colour': element['nightColour' if night else 'colour']}
                for operation in icon_ops(element, variant)]
    # An unavailable zone has no active band; use the native chart geometry,
    # then dim all bands rather than suggesting a real zone reading.
    if source.endswith('Zones') and values.get(source) is None:
        operations = chart_ops(element, value=-999, night=night, **geometry)
        from designer_colours import zone_colours
        colours = zone_colours(element, night)
        for index, operation in enumerate(operations):
            operation['colour'] = shade(colours[index], 24)
            operation['height'] = max(1, element['height'] * 2 // 5)
            operation['y'] = element['y'] + (element['height'] - operation['height']) // 2
        return operations
    return chart_ops(element, value=values.get(source), night=night, **geometry)
