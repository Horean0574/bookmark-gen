import readline from "readline";
import fs from "fs";
import YAML from "js-yaml";
import chalk from "chalk";

async function getSiteDesc(link) {
  try {
    let req = `https://api.ahfi.cn/api/websiteinfo?url=${link}`;
    const resp = await fetch(req, { signal: controller.signal });
    if (!resp.ok) return { code: 2, reason: "Fetch failed." };
    const data = await resp.json();
    if (data.code === 202) return { code: 3, reason: "Anti-crawl." };
    if (data.code === 404) return { code: 4, reason: "Not found." };
    if (data.code < 200 || data.code > 299) return { code: 5, reason: "Some other errors." };
    return { code: 1, res: data.data.description };
  } catch (err) {
    return { code: 0, reason: err };
  }
}

async function handleItems(category) {
  for (let item of category.items) {
    if (ABORTED) return;
    console.log(`Handling ${++cnt} of ${total} website "${item.name}"...`);
    item.image = `https://favicon.im/${item.link.split("//")[1]}?larger=true`;
    const descRes = await getSiteDesc(item.link);
    item.description = descRes.code === 1 ? descRes.res.trim() : "";
    if (ABORTED) return;
    if (item.description === "") {
      reviseNeeds.push({name: item.name, link: item.link, category: category.category});
      console.log(chalk.yellow(`→ Failed to get description data of website "${item.name}" or it's empty.\n`));
    } else {
      console.log(chalk.green(`→ Successfully handled information of website "${item.name}".\n`));
    }
  }
}

function reviseOne(cnt, total, recall) {
  if (cnt > total || ABORTED) {
    rl.close();
    recall();
    return;
  }
  let item = reviseNeeds[cnt - 1];
  console.log(chalk.bold(`\nRevising information of "${item.name}", its link is "${item.link}"...`));
  rl.question(chalk.blueBright("  Please input the description (right-click your mouse to paste): "), desc => {
    saveData(item, desc);
    console.log(chalk.green(`→ Successfully changed information of "${item.name}", ${cnt} out of ${total} revising tasks are finished.`));
    reviseOne(cnt + 1, total, recall);
  });
}

function saveData(item, desc) {
  for (let category of data) {
    if (category.category !== item.category) continue;
    for (let im of category.items) {
      if (im.name !== item.name) continue;
      const idx = category.items.indexOf(im);
      category.items[idx].description = desc;
      return;
    }
    return;
  }
}

function afterHandling() {
  if (ABORTED) return;
  const options = {
    quotingType: "\""
  };
  rl.question(chalk.hex("#FF4500").bold("Would you like to manually fix the missing website data immediately? (Y/N) "), ans => {
    const uppAns = ans.toUpperCase();
    if (uppAns !== "Y" && uppAns !== "YES") {
      rl.close();
      console.log(chalk.bold("\nNevermind, you can also edit it later! Here we are provisioning files for you."));
      fs.writeFileSync("bookmarks.yml", YAML.dump(data, options));
      fs.writeFileSync("revise_needs.yml", YAML.dump(reviseNeeds, options));
      console.log(chalk.green("\nSuccessfully wrote \"bookmarks.yml\"!"));
      console.log(chalk.yellow("Websites need to be fixed manually are listed in file \"revise_needs.yml\"."));
      console.log("See you!");
      return;
    }
    console.log(chalk.bold("\nSignal received! Let us guide you through the process step by step."));
    reviseOne(1, reviseNeeds.length, () => {
      fs.writeFileSync("bookmarks.yml", YAML.dump(data, options));
      console.log(chalk.green("\nSuccessfully wrote \"bookmarks.yml\"!"));
      console.log("See you!");
    });
  });
}

function main() {
  const inputs = fs.readFileSync("input.yml", "UTF8");
  global.ABORTED = false;
  global.controller = new AbortController();
  global.data = YAML.load(inputs);
  global.reviseNeeds = [];
  global.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  global.total = 0;
  global.cnt = 0;
  for (let category of data) {
    total += category.items.length;
  }
  Promise.all(data.map(handleItems)).then(afterHandling);
}

try {
  main();
} catch (err) {
  console.log(chalk.red("HERR!~main", err));
}

global.exitCnt = 0;

const exitFunc = () => {
  if (++exitCnt > 1) return;
  console.log(chalk.blueBright("\nAborting requests..."));
  ABORTED = true;
  controller.abort();
  rl.close();
  console.log(chalk.green("All requests ABORTED."));
  console.log("See you!");
}

process.on("SIGINT", exitFunc);
process.on("SIGTERM", exitFunc);
