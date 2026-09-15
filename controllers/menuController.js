const { sql, getPool } = require('../config/db');

// ---- Categories ----

async function createCategory(req, res) {
  try {
    const { name, sortOrder = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('Name', sql.NVarChar, name)
      .input('SortOrder', sql.Int, sortOrder)
      .execute('sp_Category_Create');

    res.status(201).json({ categoryId: result.recordset[0].category_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create category' });
  }
}

async function listCategories(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .execute('sp_Category_List');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch categories' });
  }
}

async function deleteCategory(req, res) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('CategoryId', sql.Int, req.params.id)
      .execute('sp_Category_Delete');
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete category' });
  }
}

// ---- Menu items ----

async function upsertItem(req, res) {
  try {
    const { itemId, categoryId, name, description, price, isAvailable, photoUrl } = req.body;
    if (!categoryId || !name || price === undefined) {
      return res.status(400).json({ error: 'categoryId, name, price are required' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('ItemId', sql.Int, itemId || null)
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('CategoryId', sql.Int, categoryId)
      .input('Name', sql.NVarChar, name)
      .input('Description', sql.NVarChar, description || null)
      .input('Price', sql.Decimal(10, 2), price)
      .input('IsAvailable', sql.Bit, isAvailable === undefined ? true : isAvailable)
      .input('PhotoUrl', sql.NVarChar, photoUrl || null)
      .execute('sp_MenuItem_Upsert');

    res.status(200).json({ itemId: result.recordset[0].item_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save menu item' });
  }
}

async function toggleAvailability(req, res) {
  try {
    const { isAvailable } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('ItemId', sql.Int, req.params.id)
      .input('IsAvailable', sql.Bit, isAvailable)
      .execute('sp_MenuItem_ToggleAvailability');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update availability' });
  }
}

async function deleteItem(req, res) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('ItemId', sql.Int, req.params.id)
      .execute('sp_MenuItem_Delete');
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete item' });
  }
}

async function listItemsForAdmin(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .execute('sp_MenuItem_ListForAdmin');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch menu items' });
  }
}

// ---- Public (no auth) ----

async function listPublicMenu(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('Slug', sql.NVarChar, req.params.slug)
      .execute('sp_MenuItem_ListPublicBySlug');

    const [shopInfo, categories, items] = result.recordsets;
    if (!shopInfo || !shopInfo[0]) return res.status(404).json({ error: 'Shop not found' });

    res.json({
      shop: shopInfo[0],
      categories,
      items,
    });
  } catch (err) {
    if (err.number === 51004) return res.status(404).json({ error: 'Shop not found or inactive' });
    console.error(err);
    res.status(500).json({ error: 'Could not fetch menu' });
  }
}

module.exports = {
  createCategory, listCategories, deleteCategory,
  upsertItem, toggleAvailability, deleteItem, listItemsForAdmin,
  listPublicMenu,
};
