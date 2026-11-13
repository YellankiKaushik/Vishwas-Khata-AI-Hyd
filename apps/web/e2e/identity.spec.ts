import {test,expect} from './offline-test';
test('capture never silently assigns the first customer',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Customer',exact:true})).toHaveValue('');
  await page.getByLabel('Exact amount in rupees',{exact:true}).fill('500');
  let drafts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/ledger/drafts'))drafts++});
  await page.getByRole('button',{name:'Review draft',exact:true}).click();
  expect(drafts).toBe(0);
  await page.getByRole('button',{name:'Type / speak a sentence',exact:true}).click();
  await expect(page.getByLabel('Customer (select the exact ID)')).toHaveValue('');
  await page.getByLabel('Sentence or corrected transcript').fill('Ramesh took 500 rupees credit');
  await page.getByRole('button',{name:'Review draft',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Ramesh',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel this draft',exact:true}).click();
});
