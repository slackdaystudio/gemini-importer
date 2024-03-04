/**
 * This script allows players and GMs to import Gemini characters into Roll20.  The Gemini Companion app is needed to generate the JSON the importer uses and
 * is available on the Apple App Store and Google Play.
 *
 * Based off the BeyondImporter_5eOGL script - https://github.com/RobinKuiper/Roll20APIScripts/tree/master/BeyondImporter_5eOGL
 *
 * Version: 1.0.0
 * Authors: sentry0
 * Contact: https://app.roll20.net/users/6148080/sentry0
 * Git: https://github.com/slackdaystudio/gemini-importer
 */
(function () {
  const script_name = "GeminiImporter";
  const state_name = "GEMINIIMPORTER";
  const debug = false;
  const style =
    "margin-left: 0px; overflow: hidden; background-color: #fff; border: 1px solid #000; padding: 5px; border-radius: 5px;color: #000";
  const buttonStyle =
    "background-color: #000; border: 1px solid #292929; border-radius: 3px; padding: 5px; color: #fff; text-align: center; float: right;";

  let caller = {};
  let object;

  on("ready", function () {
    checkInstall();

    log(script_name + " Ready! Command: !gemini");

    if (debug) {
      sendChat(script_name, script_name + " Ready!", null, { noarchive: true });
    }
  });

  on("chat:message", (msg) => {
    if (msg.type !== "api") {
      return;
    }

    let args = msg.content.split(/ --(help|config|reset|import) ?/g);
    let command = args.shift().substring(1).trim();

    caller = getObj("player", msg.playerid);

    if (command !== "gemini") {
      return;
    }

    let importData = "";

    if (args.length < 1) {
      sendHelpMenu(caller);
      return;
    }

    argLoop: for (let i = 0; i < args.length; i += 2) {
      let k = args[i].trim();
      let v = args[i + 1] != null ? args[i + 1].trim() : null;

      switch (k.toLowerCase()) {
        case "import":
          importData = v;
          break argLoop;
        case "config":
          if (args.length > 0) {
            let setting = v.split("|");
            let key = setting.shift();
            let value =
              setting[0] === "true"
                ? true
                : setting[0] === "false"
                ? false
                : setting[0] === "[NONE]"
                ? ""
                : setting[0];

            if (
              key === "prefix" &&
              value.charAt(0) !== "_" &&
              value.length > 0
            ) {
              value = `${value} `;
            }

            if (
              key === "suffix" &&
              value.charAt(0) !== "_" &&
              value.length > 0
            ) {
              value = ` ${value}`;
            }

            state[state_name][caller.id].config[key] = value;
          }

          sendConfigMenu(caller);
          break argLoop;
        case "reset":
          state[state_name][caller] = {};
          setDefaults(true);
          sendConfigMenu(caller);
          break argLoop;
        default:
          sendHelpMenu(caller);
          break argLoop;
      }
    }

    if (importData === "") {
      return;
    }

    let character = JSON.parse(importData);

    sendChat(
      script_name,
      `<div style="${style}">Import of <b>${character.name}</b> is starting.</div>`,
      null,
      { noarchive: true }
    );

    // these are automatically sorted into attributes that are written individually, in alphabetical order
    // and other attributes that are then written as a bulk write, but all are written before repeating_attributes
    let single_attributes = {};

    // these are written in one large write once everything else is written
    // NOTE: changing any stats after all these are imported would create a lot of updates, so it is
    // good that we write these when all the stats are done
    let repeating_attributes = {};

    object = null;

    // Remove characters with the same name if overwrite is enabled.
    if (state[state_name][caller.id].config.overwrite) {
      let objects = findObjs(
        {
          _type: "character",
          name:
            state[state_name][caller.id].config.prefix +
            character.name +
            state[state_name][caller.id].config.suffix,
        },
        { caseInsensitive: true }
      );

      if (objects.length > 0) {
        object = objects[0];

        for (let i = 1; i < objects.length; i++) {
          objects[i].remove();
        }
      }
    }

    if (object === null) {
      // Create character object
      object = createObj("character", {
        name:
          state[state_name][caller.id].config.prefix +
          character.name +
          state[state_name][caller.id].config.suffix,
        inplayerjournals: playerIsGM(msg.playerid)
          ? state[state_name][caller.id].config.inplayerjournals
          : msg.playerid,
        controlledby: playerIsGM(msg.playerid)
          ? state[state_name][caller.id].config.controlledby
          : msg.playerid,
      });
    }

    object.set("bio", character.background.replace(/\r?\n|\r/g, "<br />"));

    addGeneralInfo(character, single_attributes);
    addPoints(character, single_attributes);
    addAttributesAndSkills(character, single_attributes);
    addSpecializations(character, repeating_attributes);
    addSecondaryAttributes(character, single_attributes);
    addAdvantagesOrDisadvantages(character.advantages, repeating_attributes);
    addAdvantagesOrDisadvantages(
      character.disadvantages,
      repeating_attributes,
      true
    );
    addPowers(character, repeating_attributes);
    addMartialArts(character, repeating_attributes);
    addEquipment(character, single_attributes);
    addNotes(character, single_attributes);

    setAttrs(object.id, single_attributes);
    setAttrs(object.id, repeating_attributes);

    // Weaksauce
    setTimeout(() => {
      sendChat(
        script_name,
        `<div style="${style}">Import of <b>${character.name}</b> has completed.</div>`,
        null,
        { noarchive: true }
      );
    }, 5000);
  });

  const addGeneralInfo = (character, single_attributes) => {
    Object.assign(single_attributes, {
      charactername: character.name,
      occupation: character.occupation,
      species: character.species,
      gender: character.gender,
      age: character.age,
      height: character.height,
      weight: character.weight,
    });
  };

  const addPoints = (character, single_attributes) => {
    Object.assign(single_attributes, {
      attributepoints: character.creationPoints.attributes,
      skillpoints: character.creationPoints.skills,
      specializationpoints: character.creationPoints.specializations,
      advantagepoints: character.creationPoints.advantages,
      powerpoints: character.creationPoints.powers,
      martialartpoints: character.creationPoints.martialArts,
      totalpoints: Object.values(character.creationPoints).reduce(
        (a, b) => a + (b || 0),
        0
      ),
    });
  };

  const addAttributesAndSkills = (character, single_attributes) => {
    let attributes = {};
    let key = "";

    for (const attribute of character.attributes) {
      key = attribute.name.toLowerCase();

      attributes[key] = attribute.dice;
      attributes[`${key}pip`] = attribute.pips;

      for (const skill of attribute.skills) {
        key = skill.name.toLowerCase().replace(/\s/g, "");

        attributes[`${key}dice`] = skill.dice;
        attributes[`${key}pip`] = skill.pips;
      }
    }

    Object.assign(single_attributes, attributes);
  };

  const addSpecializations = (character, repeating_attributes) => {
    let row;
    let attributes;
    let dice;
    let i = 0;

    for (const specialization of character.skillSpecializations) {
      attributes = {};
      dice = specialization.dieCode.split("D");

      if (i === 0) {
        attributes["specializationname"] = specialization.name;
        attributes["rootskill"] = specialization.baseSkill;
        attributes["specializationdice"] = dice[0];
        attributes["specializationpips"] =
          dice.length === 2 ? dice[1].substring(1) : 0;
      } else {
        row = getRepeatingRowIds(
          "specialization",
          "specializationname",
          specialization.name,
          0
        );

        attributes[`repeating_addspecialization_${row}_addspecializationname`] =
          specialization.name;
        attributes[`repeating_addspecialization_${row}_addrootskill`] =
          specialization.baseSkill;
        attributes[`repeating_addspecialization_${row}_addspecializationdice`] =
          dice[0];
        attributes[`repeating_addspecialization_${row}_addspecializationpips`] =
          dice.length === 2 ? dice[1].substring(1) : 0;
      }

      Object.assign(repeating_attributes, attributes);

      i++;
    }
  };

  const addSecondaryAttributes = (character, single_attributes) => {
    let attributes = {};

    attributes["move"] = `${character.secondaryAttributes.move}m`;
    attributes["evasion"] = character.calculatedAttributes.evasion;
    attributes["resolve"] = character.calculatedAttributes.resolve;
    attributes["soak"] = character.calculatedAttributes.soak;
    attributes["bp"] = character.calculatedAttributes.bodyPoints;
    attributes["cp"] = character.secondaryAttributes.characterPoints;
    attributes["fp"] = character.secondaryAttributes.fatePoints;

    Object.assign(single_attributes, attributes);
  };

  const addAdvantagesOrDisadvantages = (
    list,
    repeating_attributes,
    isDisadvantage = false
  ) => {
    const prefix = isDisadvantage ? "dis" : "";
    let row;
    let attributes;
    let i = 0;

    for (const item of list) {
      attributes = {};

      if (i === 0) {
        attributes[`${prefix}advantagename`] = item.name;
        attributes[`${prefix}advantagedetails`] = item.details;
        attributes[`${prefix}advantagecost`] = Array.isArray(item.cost)
          ? item.cost[0]
          : item.cost;
      } else {
        row = getRepeatingRowIds(
          `${prefix}advantages`,
          `${prefix}advantagename`,
          item.name,
          0
        );

        attributes[
          `repeating_add${prefix}advantages_` +
            row +
            `_add${prefix}advantagename`
        ] = item.name;
        attributes[
          `repeating_add${prefix}advantages_` +
            row +
            `_add${prefix}advantagedetails`
        ] = item.details;
        attributes[
          `repeating_add${prefix}advantages_` +
            row +
            `_add${prefix}advantagecost`
        ] = Array.isArray(item.cost) ? item.cost[0] : item.cost;
      }

      Object.assign(repeating_attributes, attributes);

      i++;
    }
  };

  const addPowers = (character, repeating_attributes) => {
    let row;
    let attributes;
    let ranks;
    let i = 0;

    for (const power of character.powers) {
      attributes = {};
      ranks = power.cost.split("/");

      if (i === 0) {
        attributes["powername"] = power.name;
        attributes["powerdetails"] = getPowerDetails(power);
        attributes["powerranks"] = ranks[0];
        attributes["powereffectiveranks"] = ranks[1];
        attributes["powertotalranks"] = ranks[2];
      } else {
        row = getRepeatingRowIds("powers", "powername", power.name, 0);

        attributes[`repeating_addpowers_${row}_addpowername`] = power.name;
        attributes[`repeating_addpowers_${row}_addpowerdetails`] =
          getPowerDetails(power);
        attributes[`repeating_addpowers_${row}_addpowerranks`] = ranks[0];
        attributes[`repeating_addpowers_${row}_addpowereffectiveranks`] =
          ranks[1];
        attributes[`repeating_addpowers_${row}_addpowertotalranks`] = ranks[2];
      }

      Object.assign(repeating_attributes, attributes);

      i++;
    }
  };

  const addMartialArts = (character, repeating_attributes) => {
    let row;
    let attributes;
    let i = 0;

    for (const maneuver of character.martialArts) {
      attributes = {};

      if (i === 0) {
        attributes["movename"] = maneuver.name;
        attributes["movecost"] = maneuver.cost;
        attributes["strikebonus"] = maneuver.strike;
        attributes["evasionbonus"] = maneuver.evasion;
        attributes["rangebonus"] = maneuver.range;
        attributes["movedamage"] = maneuver.damage;
        attributes["movenotes"] = maneuver.notes || "";
      } else {
        row = getRepeatingRowIds("move", "movename", maneuver.name, 0);

        attributes[`repeating_addmoves_${row}_addmovename`] = maneuver.name;
        attributes[`repeating_addmoves_${row}_addmovecost`] = maneuver.cost;
        attributes[`repeating_addmoves_${row}_addstrikebonus`] =
          maneuver.strike;
        attributes[`repeating_addmoves_${row}_addevasionbonus`] =
          maneuver.evasion;
        attributes[`repeating_addmoves_${row}_addrangebonus`] = maneuver.range;
        attributes[`repeating_addmoves_${row}_addmovedamage`] = maneuver.damage;
        attributes[`repeating_addmoves_${row}_addmovenotes`] =
          maneuver.notes || "";
      }

      Object.assign(repeating_attributes, attributes);

      i++;
    }
  };

  const addEquipment = (character, single_attributes) => {
    let attributes = {};

    attributes["equipment"] = character.equipment;

    Object.assign(single_attributes, attributes);
  };

  const addNotes = (character, single_attributes) => {
    let attributes = {};

    attributes["notes"] = character.notes;

    Object.assign(single_attributes, attributes);
  };

  const getPowerDetails = (power) => {
    let details = "";

    details += power.details.name;

    if (power.details.enhancements.length >= 1) {
      details += `; ${power.details.enhancements.join("; ")}`;
    }

    if (power.details.limitations.length >= 1) {
      details += `; ${power.details.limitations.join("; ")}`;
    }

    return details;
  };

  const checkInstall = () => {
    if (!_.has(state, state_name)) {
      state[state_name] = state[state_name] || {};
    }

    setDefaults();
  };

  const setDefaults = (reset) => {
    const defaults = {
      overwrite: false,
      debug: false,
      prefix: "",
      suffix: "",
      inplayerjournals: "",
      controlledby: "",
    };

    let playerObjects = findObjs({
      _type: "player",
    });

    playerObjects.forEach((player) => {
      if (!state[state_name][player.id]) {
        state[state_name][player.id] = {};
      }

      if (!state[state_name][player.id].config) {
        state[state_name][player.id].config = defaults;
      }

      for (const item in defaults) {
        if (!state[state_name][player.id].config.hasOwnProperty(item)) {
          state[state_name][player.id].config[item] = defaults[item];
        }
      }

      if (!state[state_name][player.id].config.hasOwnProperty("firsttime")) {
        if (!reset) {
          sendConfigMenu(player, true);
        }

        state[state_name][player.id].config.firsttime = false;
      }
    });
  };

  const sendConfigMenu = (player, first) => {
    let playerid = player.id;
    let prefix =
      state[state_name][playerid].config.prefix !== ""
        ? state[state_name][playerid].config.prefix
        : "[NONE]";
    let prefixButton = makeButton(
      prefix,
      "!gemini --config prefix|?{prefix}",
      buttonStyle
    );
    let suffix =
      state[state_name][playerid].config.suffix !== ""
        ? state[state_name][playerid].config.suffix
        : "[NONE]";
    let suffixButton = makeButton(
      suffix,
      "!gemini --config suffix|?{suffix}",
      buttonStyle
    );
    let overwriteButton = makeButton(
      state[state_name][playerid].config.overwrite,
      `!gemini --config overwrite|${!state[state_name][playerid].config
        .overwrite}`,
      buttonStyle
    );
    let debugButton = makeButton(
      state[state_name][playerid].config.debug,
      `!gemini --config debug|${!state[state_name][playerid].config.debug}`,
      buttonStyle
    );

    let listItems = [
      `<span style="float: left; margin-top: 6px;">Overwrite:</span> ${overwriteButton}<br /><small style="clear: both; display: inherit;">This option will overwrite an existing character sheet with a matching character name. I recommend making a backup copy just in case.</small>`,
      `<span style="float: left; margin-top: 6px;">Prefix:</span> ${prefixButton}`,
      `<span style="float: left; margin-top: 6px;">Suffix:</span> ${suffixButton}`,
      `<span style="float: left; margin-top: 6px;">Debug:</span> ${debugButton}`,
    ];

    let list = `<b>Importer</b>${makeList(
      listItems,
      "overflow: hidden; list-style: none; padding: 0; margin: 0;",
      "overflow: hidden; margin-top: 5px;"
    )}`;
    let inPlayerJournalsButton = makeButton(
      player.get("displayname"),
      "",
      buttonStyle
    );
    let controlledByButton = makeButton(
      player.get("displayname"),
      "",
      buttonStyle
    );

    if (playerIsGM(playerid)) {
      let players = "";
      let playerObjects = findObjs({
        _type: "player",
      });

      for (let i = 0; i < playerObjects.length; i++) {
        players += `|${playerObjects[i]["attributes"]["_displayname"]},${playerObjects[i].id}`;
      }

      let ipj =
        state[state_name][playerid].config.inplayerjournals == ""
          ? "[NONE]"
          : state[state_name][playerid].config.inplayerjournals;

      if (ipj != "[NONE]" && ipj != "all") {
        ipj = getObj("player", ipj).get("displayname");
      }

      inPlayerJournalsButton = makeButton(
        ipj,
        `!gemini --config inplayerjournals|?{Player|None,[NONE]|All Players,all${players}}`,
        buttonStyle
      );

      let cb =
        state[state_name][playerid].config.controlledby == ""
          ? "[NONE]"
          : state[state_name][playerid].config.controlledby;

      if (cb != "[NONE]" && cb != "all") {
        cb = getObj("player", cb).get("displayname");
      }

      controlledByButton = makeButton(
        cb,
        `!gemini --config controlledby|?{Player|None,[NONE]|All Players,all${players}}`,
        buttonStyle
      );
    }

    let sheetListItems = [
      `<span style="float: left; margin-top: 6px;">In Player Journal:</span> ${inPlayerJournalsButton}`,
      `<span style="float: left; margin-top: 6px;">Player Control Permission:</span> ${controlledByButton}`,
    ];

    let sheetList = `<hr><b>Character Sheet</b>${makeList(
      sheetListItems,
      "overflow: hidden; list-style: none; padding: 0; margin: 0;",
      "overflow: hidden; margin-top: 5px;"
    )}`;
    let debug = "";
    let resetButton = makeButton(
      "Reset",
      "!gemini --reset",
      `${buttonStyle} margin: auto; width: 90%; display: block; float: none;`
    );
    let title_text = first
      ? `${script_name} First Time Setup`
      : `${script_name} Config`;
    let text = `<div style="${style}">${makeTitle(
      title_text
    )}${list}${sheetList}${debug}<hr>${resetButton}</div>`;

    sendChat(script_name, `/w "${player.get("displayname")}" ${text}`, null, {
      noarchive: true,
    });
  };

  const sendHelpMenu = (player, first) => {
    let listItems = [
      '<span style="text-decoration: underline; font-size: 90%;">!gemini --help</span><br />Shows this menu.',
      '<span style="text-decoration: underline; font-size: 90%;">!gemini --config</span><br />Shows the configuration menu. (GM only)',
      '<span style="text-decoration: underline; font-size: 90%;">!gemini --import [CHARACTER JSON]</span><br />Imports a character from the Gemini app.',
    ];

    let text = `<div style="${style}">`;
    text += makeTitle(`${script_name} Help`);
    text += "<ol>";
    text += "<li>Export your character from the Gemini app</li>";
    text +=
      "<li>Open the exported file and copy the file contents to your clipboard</li>";
    text +=
      "<li>Run the command `!gemini --import {}` making sure you replace `{}` with the contents of your clipboard</li>";
    text += "</ol>";
    text += "<hr>";
    text += `<b>Commands:</b> ${makeList(
      listItems,
      "list-style: none; padding: 0; margin: 0;"
    )}`;
    text += "</div>";

    sendChat(script_name, `/w "${player.get("displayname")}" ${text}`, null, {
      noarchive: true,
    });
  };

  const makeTitle = (title) => {
    return `<h3 style="margin-bottom: 10px;color: #000">${title}</h3>`;
  };

  const makeButton = (title, href, style) => {
    return `<a style="${style}" href="${href}">${title}</a>`;
  };

  const makeList = (items, listStyle, itemStyle) => {
    let list = `<ul style="${listStyle}">`;

    items.forEach((item) => {
      list += `<li style="${itemStyle}">${item}</li>`;
    });

    list += "</ul>";

    return list;
  };

  const getRepeatingRowIds = (section, attribute, matchValue, index) => {
    let ids = [];

    if (state[state_name][caller.id].config.overwrite) {
      let matches = findObjs({
        type: "attribute",
        characterid: object.id,
      }).filter((attr) => {
        return (
          attr.get("name").indexOf("repeating_add" + section) !== -1 &&
          attr.get("name").indexOf(attribute) !== -1 &&
          attr.get("current") == matchValue
        );
      });

      for (const i in matches) {
        let row = matches[i]
          .get("name")
          .replace(`repeating_add${section}_`, "")
          .replace(`_${attribute}`, "");

        ids.push(row);
      }

      if (ids.length === 0) {
        ids.push(generateRowID());
      }
    } else {
      ids.push(generateRowID());
    }

    if (index === null) {
      return ids;
    } else {
      return ids[index] == null && index >= 0 ? generateRowID() : ids[index];
    }
  };

  const generateRowID = () => {
    "use strict";

    return generateUUID().replace(/_/g, "Z");
  };

  const generateUUID = (function () {
    let a = 0,
      b = [];

    return function () {
      let c = new Date().getTime() + 0,
        d = c === a;
      a = c;

      for (var e = new Array(8), f = 7; 0 <= f; f--) {
        e[f] =
          "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(
            c % 64
          );
        c = Math.floor(c / 64);
      }

      c = e.join("");

      if (d) {
        for (f = 11; 0 <= f && 63 === b[f]; f--) {
          b[f] = 0;
        }
        b[f]++;
      } else {
        for (f = 0; 12 > f; f++) {
          b[f] = Math.floor(64 * Math.random());
        }
      }

      for (f = 0; 12 > f; f++) {
        c +=
          "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(
            b[f]
          );
      }

      return c;
    };
  })();
})();
