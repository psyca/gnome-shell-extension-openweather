/* jshint esnext:true */
/*
 *
 *  Weather extension for GNOME Shell preferences
 *  - Creates a widget to set the preferences of the weather extension
 *
 * Copyright (C) 2012 - 2013
 *     Canek Peláez <canek@ciencias.unam.mx>,
 *     Christian METZLER <neroth@xeked.com>,
 *     Jens Lody <jens@jenslody.de>,
 *
 * This file is part of gnome-shell-extension-openweather.
 *
 * gnome-shell-extension-openweather is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * gnome-shell-extension-openweather is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE.  See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-openweather.  If not, see
 * <http://www.gnu.org/licenses/>.
 *
 */
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GObject = imports.gi.GObject;
const GtkBuilder = Gtk.Builder;
const Gio = imports.gi.Gio;
const Gettext = imports.gettext.domain('gnome-shell-extension-openweather');
const _ = Gettext.gettext;
const Soup = imports.gi.Soup;

const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = imports.misc.config;
const Convenience = Me.imports.convenience;

const EXTENSIONDIR = Me.dir.get_path();

const WEATHER_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.openweather';
const WEATHER_UNIT_KEY = 'unit';
const WEATHER_PRESSURE_UNIT_KEY = 'pressure-unit';
const WEATHER_WIND_SPEED_UNIT_KEY = 'wind-speed-unit';
const WEATHER_WIND_DIRECTION_KEY = 'wind-direction';
const WEATHER_CITY_KEY = 'city';
const WEATHER_ACTUAL_CITY_KEY = 'actual-city';
const WEATHER_TRANSLATE_CONDITION_KEY = 'translate-condition';
const WEATHER_USE_SYMBOLIC_ICONS_KEY = 'use-symbolic-icons';
const WEATHER_USE_TEXT_ON_BUTTONS_KEY = 'use-text-on-buttons';
const WEATHER_SHOW_TEXT_IN_PANEL_KEY = 'show-text-in-panel';
const WEATHER_POSITION_IN_PANEL_KEY = 'position-in-panel';
const WEATHER_SHOW_COMMENT_IN_PANEL_KEY = 'show-comment-in-panel';
const WEATHER_REFRESH_INTERVAL_CURRENT = 'refresh-interval-current';
const WEATHER_REFRESH_INTERVAL_FORECAST = 'refresh-interval-forecast';
const WEATHER_CENTER_FORECAST_KEY = 'center-forecast';
const WEATHER_DAYS_FORECAST = 'days-forecast';
const WEATHER_DECIMAL_PLACES = 'decimal-places';
const WEATHER_OWM_API_KEY = 'appid';

//URL
const WEATHER_URL_BASE = 'http://api.openweathermap.org/data/2.5/';
const WEATHER_URL_CURRENT = WEATHER_URL_BASE + 'weather';
const WEATHER_URL_FIND = WEATHER_URL_BASE + 'find';

let _httpSession;

let mCities = null;

const WeatherPrefsWidget = new GObject.Class({
    Name: 'OpenWeatherExtension.Prefs.Widget',
    GTypeName: 'OpenWeatherExtensionPrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);

        this.initWindow();

        this.refreshUI();

        this.add(this.MainWidget);
    },

    Window: new Gtk.Builder(),

    initWindow: function() {
        mCities = null;

        this.Window.add_from_file(EXTENSIONDIR + "/weather-settings.ui");

        this.MainWidget = this.Window.get_object("main-widget");
        this.treeview = this.Window.get_object("tree-treeview");
        this.liststore = this.Window.get_object("liststore");
        this.Iter = this.liststore.get_iter_first();

        this.Window.get_object("tree-toolbutton-add").connect("clicked", Lang.bind(this, function() {
            this.addCity();
        }));

        this.Window.get_object("tree-toolbutton-remove").connect("clicked", Lang.bind(this, function() {
            this.removeCity();
        }));

        this.Window.get_object("treeview-selection").connect("changed", Lang.bind(this, function(selection) {
            this.selectionChanged(selection);
        }));

        this.treeview.set_model(this.liststore);

        let column = new Gtk.TreeViewColumn();
        this.treeview.append_column(column);

        let renderer = new Gtk.CellRendererText();
        column.pack_start(renderer, null);

        column.set_cell_data_func(renderer, function() {
            arguments[1].markup = arguments[2].get_value(arguments[3], 0);
        });

        this.initConfigWidget();
        this.addLabel(_("Temperature Unit"));
        this.addComboBox(["\u00b0C", "\u00b0F", "K", "\u00b0Ra", "\u00b0R\u00E9", "\u00b0R\u00F8", "\u00b0De", "\u00b0N"], "units");
        this.addLabel(_("Wind Speed Unit"));
        this.addComboBox(["km/h", "mph", "m/s", "kn", "ft/s", "Beaufort"], "wind_speed_unit");
        this.addLabel(_("Pressure Unit"));
        this.addComboBox(["hPa", "inHg", "bar", "Pa", "kPa", "atm", "at", "Torr", "psi"], "pressure_unit");
        this.addLabel(_("Position in Panel"));
        this.addComboBox([_("Center"), _("Right"), _("Left")], "position_in_panel");
        this.addLabel(_("Wind Direction by Arrows"));
        this.addSwitch("wind_direction");
        this.addLabel(_("Translate Conditions"));
        this.addSwitch("translate_condition");
        this.addLabel(_("Symbolic Icons"));
        this.addSwitch("icon_type");
        this.addLabel(_("Text on buttons"));
        this.addSwitch("use_text_on_buttons");
        this.addLabel(_("Temperature in Panel"));
        this.addSwitch("text_in_panel");
        this.addLabel(_("Conditions in Panel"));
        this.addSwitch("comment_in_panel");
        this.addLabel(_("Center forecast"));
        this.addSwitch("center_forecast");
        this.addLabel(_("Number of days in forecast"));
        this.addComboBox(["2", "3", "4", "5", "6", "7", "8", "9", "10"], "days_forecast");
        this.addLabel(_("Maximal number of digits after the decimal point"));
        this.addComboBox(["0", "1", "2", "3"], "decimal_places");
        this.addLabel(_("Personal Api key from openweathermap.org"));
        this.addAppidEntry(("appid"));
    },

    refreshUI: function() {
        this.MainWidget = this.Window.get_object("main-widget");
        this.treeview = this.Window.get_object("tree-treeview");
        this.liststore = this.Window.get_object("liststore");
        this.Iter = this.liststore.get_iter_first();

        this.Window.get_object("tree-toolbutton-remove").sensitive = Boolean(this.city.length);

        if (mCities != this.city) {
            if (this.liststore !== undefined)
                this.liststore.clear();

            if (this.city.length > 0) {
                let city = String(this.city).split(" && ");

                if (city && typeof city == "string")
                    city = [city];

                let current = this.liststore.get_iter_first();

                for (let i in city) {
                    current = this.liststore.append();
                    this.liststore.set_value(current, 0, this.extractLocation(city[i]));
                }
            }

            mCities = this.city;
        }

        this.changeSelection();

        let config = this.configWidgets;
        for (let i in config)
            if (config[i][0].active != this[config[i][1]])
                config[i][0].active = this[config[i][1]];
    },

    initConfigWidget: function() {
        this.inc(1);
        let a = this.Window.get_object("right-widget-table");
        a.visible = 1;
        a.can_focus = 0;
        this.right_widget = a;
    },

    x: [0, 1],

    y: [0, 1],

    configWidgets: [],

    inc: function() {
        if (arguments[0]) {
            this.x[0] = 0;
            this.x[1] = 1;
            this.y[0] = 0;
            this.y[1] = 1;
            return 0;
        }

        if (this.x[0] == 1) {
            this.x[0] = 0;
            this.x[1] = 1;
            this.y[0] += 1;
            this.y[1] += 1;
            return 0;
        } else {
            this.x[0] += 1;
            this.x[1] += 1;
            return 0;
        }
    },

    addLabel: function(text) {
        let l = new Gtk.Label({
            label: text,
            xalign: 0
        });
        l.visible = 1;
        l.can_focus = 0;
        this.right_widget.attach(l, this.x[0], this.x[1], this.y[0], this.y[1], 0, 0, 0, 0);
        this.inc();
    },

    addComboBox: function(a, b) {
        let cf = new Gtk.ComboBoxText();
        this.configWidgets.push([cf, b]);
        cf.visible = 1;
        cf.can_focus = 0;
        cf.width_request = 100;
        for (let i in a)
            cf.append_text(a[i]);
        cf.active = this[b];
        cf.connect("changed", Lang.bind(this, function() {
            this[b] = arguments[0].active;
        }));
        this.right_widget.attach(cf, this.x[0], this.x[1], this.y[0], this.y[1], 0, 0, 0, 0);
        this.inc();
    },

    addSwitch: function(a) {
        let sw = new Gtk.Switch();
        this.configWidgets.push([sw, a]);
        sw.visible = 1;
        sw.can_focus = 0;
        sw.active = this[a];
        sw.connect("notify::active", Lang.bind(this, function() {
            this[a] = arguments[0].active;
        }));
        this.right_widget.attach(sw, this.x[0], this.x[1], this.y[0], this.y[1], 0, 0, 0, 0);
        this.inc();
    },

    addAppidEntry: function(a) {
        let en = new Gtk.Entry();
        this.configWidgets.push([en, a]);
        en.visible = 1;
        en.can_focus = 1;
        en.set_width_chars(32);
        en.text = this[a];
        if (this[a].length != 32)
            en.set_icon_from_icon_name(Gtk.PositionType.LEFT, 'dialog-warning');

        en.connect("notify::text", Lang.bind(this, function() {
            let key = arguments[0].text;
            let rgba = new Gdk.Color();
            this[a] = key;
            if (key.length == 32)
                en.set_icon_from_icon_name(Gtk.PositionType.LEFT, '');
            else
                en.set_icon_from_icon_name(Gtk.PositionType.LEFT, 'dialog-warning');
        }));
        this.right_widget.attach(en, this.x[0], this.x[1], this.y[0], this.y[1], 0, 0, 0, 0);
        this.inc();
    },

    selectionChanged: function(select) {
        let a = select.get_selected_rows(this.liststore)[0][0];

        if (a !== undefined)
            if (this.actual_city != parseInt(a.to_string()))
                this.actual_city = parseInt(a.to_string());
    },

    addCity: function() {
        let textDialog = _("Name of the city");

        let dialog = new Gtk.Dialog({
            title: ""
        });
        let entry = new Gtk.Entry();
        let completion = new Gtk.EntryCompletion();
        entry.set_completion(completion);
        let completionModel = new Gtk.ListStore();
        completionModel.set_column_types([GObject.TYPE_STRING]);
        completion.set_model(completionModel);
        completion.set_text_column(0);
        completion.set_popup_single_match(true);
        completion.set_minimum_key_length(1);
        completion.set_match_func(function(completion, key, iter) {
            if (iter) {
                if (completionModel.get_value(iter, 0))
                    return true;
            }
            return false;
        });
        entry.margin_top = 12;
        entry.margin_bottom = 12;
        let label = new Gtk.Label({
            label: textDialog
        });

        dialog.set_border_width(12);
        dialog.set_modal(1);
        dialog.set_resizable(0);
        //dialog.set_transient_for(***** Need parent Window *****);

        dialog.add_button(Gtk.STOCK_CANCEL, 0);
        let d = dialog.add_button(Gtk.STOCK_OK, 1);

        d.set_can_default(true);
        d.sensitive = 0;

        dialog.set_default(d);
        entry.activates_default = true;

        let testLocation = Lang.bind(this, function(location) {
            if (location.search(/\[/) == -1 || location.search(/\]/) == -1)
                return 0;

            let id = location.split(/\[/)[1].split(/\]/)[0];
            if (!id)
                return 0;

            this.loadJsonAsync(WEATHER_URL_CURRENT, {
                id: id
            }, function() {
                d.sensitive = 0;
                if (arguments[0] === undefined)
                    return 0;

                let city = arguments[0];

                if (Number(city.cod) != 200)
                    return 0;

                if (Number(city.count) === 0)
                    return 0;

                d.sensitive = 1;
                return 0;
            }, "testLocation");
            return 0;
        });

        let searchLocation = Lang.bind(this, function() {
            let location = entry.get_text();
            let params = {
                cnt: '30',
                sort: 'population',
                type: 'like',
                units: 'metric',
                q: location
            };
            if (this.appid)
                params.APPID = this.appid;
            if (testLocation(location) === 0)
                this.loadJsonAsync(WEATHER_URL_FIND, params, function() {
                    if (!arguments[0])
                        return 0;
                    let city = arguments[0];

                    if (Number(city.cod) != 200)
                        return 0;

                    if (Number(city.count) > 0)
                        city = city.list;
                    else
                        return 0;

                    completionModel.clear();

                    let current = this.liststore.get_iter_first();

                    var m = {};
                    for (var i in city) {

                        current = completionModel.append();

                        let cityText = city[i].name;

                        if (city[i].sys)
                            cityText += ", " + city[i].sys.country;

                        if (city[i].id)
                            cityText += " [" + city[i].id + "]";

                        if (m[cityText])
                            continue;
                        else
                            m[cityText] = 1;

                        completionModel.set_value(current, 0, cityText);
                    }

                    completion.complete();
                    return 0;
                }, "getInfo");
            return 0;
        });

        entry.connect("changed", searchLocation);

        let dialog_area = dialog.get_content_area();
        dialog_area.pack_start(label, 0, 0, 0);
        dialog_area.pack_start(entry, 0, 0, 0);
        dialog.connect("response", Lang.bind(this, function(w, response_id) {
            if (response_id) {
                if (entry.get_text().search(/\[/) == -1 || entry.get_text().search(/\]/) == -1)
                    return 0;

                let id = entry.get_text().split(/\[/)[1].split(/\]/)[0];
                if (!id)
                    return 0;

                let params = {
                    id: id,
                    type: 'accurate'
                };
                if (this.appid)
                    params.APPID = this.appid;
                this.loadJsonAsync(WEATHER_URL_CURRENT, params, Lang.bind(this, function() {
                    if (!arguments[0])
                        return 0;
                    let city = arguments[0];

                    if (Number(city.cod) != 200)
                        return 0;

                    if (!id)
                        return 0;

                    if (id != city.id)
                        return 0;

                    let cityText = entry.get_text().split(/,/)[0];

                    if (city.sys)
                        cityText += " (" + city.sys.country + ")";

                    if (this.city)
                        this.city = this.city + " && " + city.id + ">" + cityText;
                    else
                        this.city = city.id + ">" + cityText;

                    return 0;
                }), "lastTest");
            }
            dialog.hide();
            return 0;
        }));

        dialog.show_all();
    },

    removeCity: function() {
        let city = this.city.split(" && ");
        if (!city.length)
            return 0;
        let ac = this.actual_city;
        let textDialog = _("Remove %s ?").replace("%s", this.extractLocation(city[ac]));
        let dialog = new Gtk.Dialog({
            title: ""
        });
        let label = new Gtk.Label({
            label: textDialog
        });
        label.margin_bottom = 12;

        dialog.set_border_width(12);
        dialog.set_modal(1);
        dialog.set_resizable(0);
        //dialog.set_transient_for(***** Need parent Window *****);

        dialog.add_button(Gtk.STOCK_NO, 0);
        let d = dialog.add_button(Gtk.STOCK_YES, 1);

        d.set_can_default(true);
        dialog.set_default(d);

        let dialog_area = dialog.get_content_area();
        dialog_area.pack_start(label, 0, 0, 0);
        dialog.connect("response", Lang.bind(this, function(w, response_id) {
            if (response_id) {
                if (city.length === 0)
                    city = [];

                if (city.length > 0 && typeof city != "object")
                    city = [city];

                if (city.length > 0)
                    city.splice(ac, 1);

                if (city.length > 1)
                    this.city = city.join(" && ");
                else if (city[0])
                    this.city = city[0];
                else
                    this.city = "";
            }
            dialog.hide();
            return 0;
        }));

        dialog.show_all();
        return 0;
    },

    changeSelection: function() {
        let path = this.actual_city;
        if (arguments[0])
            path = arguments[0];
        path = Gtk.TreePath.new_from_string(String(path));
        this.treeview.get_selection().select_path(path);
    },

    loadJsonAsync: function(url, params, fun, id) {
        if (_httpSession === undefined) {
            if (ExtensionUtils.versionCheck(['3.6'], Config.PACKAGE_VERSION)) {
                // Soup session (see https://bugzilla.gnome.org/show_bug.cgi?id=661323#c64) (Simon Legner)
                _httpSession = new Soup.SessionAsync();
                Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());
            } else
                _httpSession = new Soup.Session();
        }

        let here = this;

        let message = Soup.form_request_new_from_hash('GET', url, params);

        if (this.asyncSession === undefined)
            this.asyncSession = {};

        if (this.asyncSession[id] !== undefined && this.asyncSession[id]) {
            _httpSession.abort();
            this.asyncSession[id] = 0;
        }

        this.asyncSession[id] = 1;
        _httpSession.queue_message(message, function(_httpSession, message) {
            here.asyncSession[id] = 0;
            if (!message.response_body.data) {
                fun.call(here, 0);
                return 0;
            }

            try {
                let jp = JSON.parse(message.response_body.data);
                fun.call(here, jp);
            } catch (e) {
                fun.call(here, 0);
                return 0;
            }
            return 0;
        });
    },

    loadConfig: function() {
        this.Settings = Convenience.getSettings(WEATHER_SETTINGS_SCHEMA);
        this.Settings.connect("changed", Lang.bind(this, function() {
            this.refreshUI();
        }));
    },

    get units() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_enum(WEATHER_UNIT_KEY);
    },

    set units(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_enum(WEATHER_UNIT_KEY, v);
    },

    get pressure_unit() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_enum(WEATHER_PRESSURE_UNIT_KEY);
    },

    set pressure_unit(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_enum(WEATHER_PRESSURE_UNIT_KEY, v);
    },

    get wind_speed_unit() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_enum(WEATHER_WIND_SPEED_UNIT_KEY);
    },

    set wind_speed_unit(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_enum(WEATHER_WIND_SPEED_UNIT_KEY, v);
    },

    get wind_direction() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_WIND_DIRECTION_KEY);
    },

    set wind_direction(v) {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.set_boolean(WEATHER_WIND_DIRECTION_KEY, v);
    },

    get city() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_string(WEATHER_CITY_KEY);
    },

    set city(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_string(WEATHER_CITY_KEY, v);
    },

    get actual_city() {
        if (!this.Settings)
            this.loadConfig();
        let a = this.Settings.get_int(WEATHER_ACTUAL_CITY_KEY);
        let citys = this.city.split(" && ");

        if (citys && typeof citys == "string")
            citys = [citys];

        let l = citys.length - 1;

        if (a < 0)
            a = 0;

        if (l < 0)
            l = 0;

        if (a > l)
            a = l;

        return a;
    },

    set actual_city(a) {
        if (!this.Settings)
            this.loadConfig();
        let citys = this.city.split(" && ");

        if (citys && typeof citys == "string")
            citys = [citys];

        let l = citys.length - 1;

        if (a < 0)
            a = 0;

        if (l < 0)
            l = 0;

        if (a > l)
            a = l;

        this.Settings.set_int(WEATHER_ACTUAL_CITY_KEY, a);
    },

    get translate_condition() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_TRANSLATE_CONDITION_KEY);
    },

    set translate_condition(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(WEATHER_TRANSLATE_CONDITION_KEY, v);
    },

    get icon_type() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_USE_SYMBOLIC_ICONS_KEY);
    },

    set icon_type(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(WEATHER_USE_SYMBOLIC_ICONS_KEY, v);
    },

    get use_text_on_buttons() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_USE_TEXT_ON_BUTTONS_KEY);
    },

    set use_text_on_buttons(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(WEATHER_USE_TEXT_ON_BUTTONS_KEY, v);
    },

    get text_in_panel() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_SHOW_TEXT_IN_PANEL_KEY);
    },

    set text_in_panel(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(WEATHER_SHOW_TEXT_IN_PANEL_KEY, v);
    },

    get position_in_panel() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_enum(WEATHER_POSITION_IN_PANEL_KEY);
    },

    set position_in_panel(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_enum(WEATHER_POSITION_IN_PANEL_KEY, v);
    },

    get comment_in_panel() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_SHOW_COMMENT_IN_PANEL_KEY);
    },

    set comment_in_panel(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(WEATHER_SHOW_COMMENT_IN_PANEL_KEY, v);
    },

    get refresh_interval_current() {
        if (!this.Settings)
            this.loadConfig();
        let v = this.Settings.get_int(WEATHER_REFRESH_INTERVAL_CURRENT);
        return ((v >= 600) ? v : 600);
    },

    set refresh_interval_current(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_int(WEATHER_REFRESH_INTERVAL_CURRENT, ((v >= 600) ? v : 600));
    },

    get refresh_interval_forecast() {
        if (!this.Settings)
            this.loadConfig();
        let v = this.Settings.get_int(WEATHER_REFRESH_INTERVAL_FORECAST);
        return ((v >= 600) ? v : 600);
    },

    set refresh_interval_forecast(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_int(WEATHER_REFRESH_INTERVAL_FORECAST, ((v >= 600) ? v : 600));
    },

    get center_forecast() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_boolean(WEATHER_CENTER_FORECAST_KEY);
    },

    set center_forecast(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_boolean(WEATHER_CENTER_FORECAST_KEY, v);
    },

    get days_forecast() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_int(WEATHER_DAYS_FORECAST) - 2;
    },

    set days_forecast(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_int(WEATHER_DAYS_FORECAST, v + 2);
    },

    get decimal_places() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_int(WEATHER_DECIMAL_PLACES);
    },

    set decimal_places(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_int(WEATHER_DECIMAL_PLACES, v);
    },

    get appid() {
        if (!this.Settings)
            this.loadConfig();
        return this.Settings.get_string(WEATHER_OWM_API_KEY);
    },

    set appid(v) {
        if (!this.Settings)
            this.loadConfig();
        this.Settings.set_string(WEATHER_OWM_API_KEY, v);
    },

    extractLocation: function(a) {
        if (a.search(">") == -1)
            return _("Invalid city");
        return a.split(">")[1];
    },

    extractId: function(a) {
        if (a.search(">") == -1)
            return 0;
        return a.split(">")[0];
    }
});

function init() {
    Convenience.initTranslations('gnome-shell-extension-openweather');
}

function buildPrefsWidget() {
    let widget = new WeatherPrefsWidget();
    widget.show_all();
    return widget;
}
